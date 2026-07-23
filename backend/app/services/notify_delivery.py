"""Доставка уведомлений вовне: email (SMTP) и Telegram-бот.

Очередь outbound_messages разбирается фоновым воркером (ТЗ §11 —
асинхронно). Telegram-поллер работает через long polling: сервер сам
ходит к api.telegram.org изнутри сети, наружу ничего не публикуется.
Кнопки «Согласовать/Отклонить» позволяют визировать с телефона.
"""
import asyncio
import json
import smtplib
import uuid
from email.mime.text import MIMEText
from email.utils import formataddr

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.db import async_session
from app.core.logging_conf import get_logger
from app.models import OutboundMessage, Task, User
from app.services import process_service
from app.services.process_service import utcnow

logger = get_logger()

MAX_ATTEMPTS = 5

# чаты, от которых ждём комментарий отклонения: chat_id -> task_id
_pending_rejections: dict[int, str] = {}


# --- Постановка в очередь (вызывается из сервисов при создании уведомления) ---

def enqueue_for_user(
    session,
    user: User,
    *,
    title: str,
    body: str | None,
    link: str | None,
    action_task_id: uuid.UUID | None = None,
) -> None:
    """Ставит сообщение в очередь по всем доступным каналам пользователя."""
    text_body = title + (f"\n\n{body}" if body else "")
    if user.email and settings.smtp_host:
        email_body = text_body
        if link:
            email_body += f"\n\nОткрыть в системе: {settings.app_base_url}{link}"
        session.add(OutboundMessage(
            channel="EMAIL", recipient=user.email,
            subject=title, body=email_body,
        ))
    if user.telegram_chat_id and settings.telegram_bot_token:
        buttons = None
        if action_task_id is not None:
            buttons = [
                {"text": "✅ Согласовать", "callback_data": f"apr:{action_task_id}"},
                {"text": "❌ Отклонить", "callback_data": f"rej:{action_task_id}"},
            ]
        session.add(OutboundMessage(
            channel="TELEGRAM", recipient=str(user.telegram_chat_id),
            subject=None, body=text_body, buttons=buttons,
        ))


# --- Отправка ---

def _send_email_sync(recipient: str, subject: str, body: str) -> None:
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = formataddr(("BPM AL-BINA", settings.smtp_from))
    message["To"] = recipient
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_pass)
        smtp.sendmail(settings.smtp_from, [recipient], message.as_string())


async def telegram_api(method: str, payload: dict, timeout: float = 35) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}",
            json=payload,
        )
        return response.json()


async def _send_message(message: OutboundMessage) -> None:
    if message.channel == "EMAIL":
        await asyncio.to_thread(
            _send_email_sync, message.recipient, message.subject or "BPM", message.body
        )
    elif message.channel == "TELEGRAM":
        payload: dict = {"chat_id": int(message.recipient), "text": message.body}
        if message.buttons:
            payload["reply_markup"] = {"inline_keyboard": [message.buttons]}
        result = await telegram_api("sendMessage", payload)
        if not result.get("ok"):
            raise RuntimeError(f"telegram: {result.get('description')}")


async def deliver_pending_once() -> int:
    """Один проход по очереди; возвращает число обработанных."""
    async with async_session() as session:
        messages = list(
            await session.scalars(
                select(OutboundMessage)
                .where(OutboundMessage.status == "PENDING")
                .order_by(OutboundMessage.created_at)
                .limit(20)
            )
        )
        for message in messages:
            message.attempts += 1
            try:
                await _send_message(message)
                message.status = "SENT"
                message.sent_at = utcnow()
            except Exception as exc:  # noqa: BLE001 — фиксируем любую ошибку доставки
                message.last_error = str(exc)[:1000]
                if message.attempts >= MAX_ATTEMPTS:
                    message.status = "FAILED"
                logger.error(json.dumps({
                    "event": "delivery_error", "channel": message.channel,
                    "attempt": message.attempts, "error": str(exc)[:300],
                }, ensure_ascii=False))
        await session.commit()
        return len(messages)


async def delivery_worker() -> None:
    while True:
        try:
            await deliver_pending_once()
        except Exception as exc:  # noqa: BLE001
            logger.error(f'{{"event": "delivery_worker_crash", "error": "{exc}"}}')
        await asyncio.sleep(5)


# --- Telegram: привязка и обработка нажатий ---

async def _handle_start(chat_id: int, text: str) -> None:
    """/start <код> — привязка аккаунта по коду из профиля."""
    parts = text.split(maxsplit=1)
    code = parts[1].strip() if len(parts) > 1 else ""
    async with async_session() as session:
        user = None
        if code:
            user = await session.scalar(
                select(User).where(User.telegram_link_code == code)
            )
        if user is None:
            await telegram_api("sendMessage", {
                "chat_id": chat_id,
                "text": "Здравствуйте! Это бот согласования BPM AL-BINA.\n"
                        "Чтобы привязать аккаунт, получите код в системе "
                        "(меню пользователя → Telegram) и отправьте команду:\n"
                        "/start ВАШ-КОД",
            })
            return
        user.telegram_chat_id = chat_id
        user.telegram_link_code = None
        await session.commit()
        name = user.display_name or user.ad_sam_account_name
        await telegram_api("sendMessage", {
            "chat_id": chat_id,
            "text": f"Готово, {name}! Аккаунт привязан.\n"
                    "Сюда будут приходить уведомления о задачах с кнопками "
                    "согласования.",
        })


async def _handle_callback(callback: dict) -> None:
    chat_id = callback["message"]["chat"]["id"]
    data = callback.get("data", "")
    await telegram_api("answerCallbackQuery", {"callback_query_id": callback["id"]})

    action, _, task_id = data.partition(":")
    async with async_session() as session:
        user = await session.scalar(
            select(User).where(User.telegram_chat_id == chat_id)
        )
        if user is None:
            await telegram_api("sendMessage", {
                "chat_id": chat_id, "text": "Аккаунт не привязан."})
            return
        task = await session.get(Task, uuid.UUID(task_id))
        if task is None:
            await telegram_api("sendMessage", {
                "chat_id": chat_id, "text": "Задача не найдена."})
            return

        if action == "rej":
            _pending_rejections[chat_id] = task_id
            await telegram_api("sendMessage", {
                "chat_id": chat_id,
                "text": "Напишите комментарий отклонения ответным сообщением "
                        "(обязателен).",
            })
            return

        try:
            await process_service.complete_task(
                session, task=task, user=user, approve=True,
                comment="Согласовано через Telegram", ip="telegram",
            )
            await telegram_api("sendMessage", {
                "chat_id": chat_id, "text": "✅ Согласовано."})
        except Exception as exc:  # noqa: BLE001 — HTTPException с текстом причины
            detail = getattr(exc, "detail", str(exc))
            await telegram_api("sendMessage", {
                "chat_id": chat_id, "text": f"Не получилось: {detail}"})


async def _handle_text(chat_id: int, text: str) -> None:
    task_id = _pending_rejections.pop(chat_id, None)
    if task_id is None:
        return
    async with async_session() as session:
        user = await session.scalar(
            select(User).where(User.telegram_chat_id == chat_id)
        )
        task = await session.get(Task, uuid.UUID(task_id))
        if user is None or task is None:
            return
        try:
            await process_service.complete_task(
                session, task=task, user=user, approve=False,
                comment=text.strip(), ip="telegram",
            )
            await telegram_api("sendMessage", {
                "chat_id": chat_id, "text": "❌ Документ отклонён."})
        except Exception as exc:  # noqa: BLE001
            detail = getattr(exc, "detail", str(exc))
            await telegram_api("sendMessage", {
                "chat_id": chat_id, "text": f"Не получилось: {detail}"})


async def telegram_poller() -> None:
    """Long polling getUpdates: работает изнутри сети, порты не открываются."""
    offset = 0
    while True:
        try:
            result = await telegram_api(
                "getUpdates", {"offset": offset, "timeout": 25}, timeout=35
            )
            for update in result.get("result", []):
                offset = update["update_id"] + 1
                try:
                    if "callback_query" in update:
                        await _handle_callback(update["callback_query"])
                    elif "message" in update and "text" in update["message"]:
                        text = update["message"]["text"]
                        chat_id = update["message"]["chat"]["id"]
                        if text.startswith("/start"):
                            await _handle_start(chat_id, text)
                        else:
                            await _handle_text(chat_id, text)
                except Exception as exc:  # noqa: BLE001
                    logger.error(f'{{"event": "telegram_update_error", "error": "{exc}"}}')
        except Exception:  # noqa: BLE001 — сеть недоступна и т.п.
            await asyncio.sleep(10)
        await asyncio.sleep(1)
