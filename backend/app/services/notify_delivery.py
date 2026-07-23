"""Доставка уведомлений вовне: email (SMTP) и Telegram-бот.

Очередь outbound_messages разбирается фоновым воркером (ТЗ §11 —
асинхронно). Telegram-поллер работает через long polling: сервер сам
ходит к api.telegram.org изнутри сети, наружу ничего не публикуется.
Кнопки «Согласовать/Отклонить» позволяют визировать с телефона.
"""
import asyncio
import email as email_lib
import imaplib
import json
import re
import smtplib
import uuid
from email.header import decode_header, make_header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from html import escape
from urllib.parse import quote

import httpx
import jwt as pyjwt
from sqlalchemy import select

from app.core.config import settings
from app.core.db import async_session
from app.core.logging_conf import get_logger
from app.core.security import create_email_action_token, decode_email_action_token
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
    external_body: str | None = None,
    action_task_id: uuid.UUID | None = None,
) -> None:
    """Ставит сообщение в очередь по всем доступным каналам пользователя.
    Во внешние каналы уходит расширенный текст (содержание, вложения)
    и прямая ссылка на документ."""
    content = external_body if external_body is not None else body
    text_body = title + (f"\n\n{content}" if content else "")
    full_link = f"{settings.app_base_url}{link}" if link else None
    if user.email and settings.smtp_host:
        email_body = text_body
        if full_link:
            email_body += f"\n\nОткрыть документ: {full_link}"
        html_body = None
        # почтовое согласование: mailto-кнопки, если включён приём (IMAP)
        if action_task_id is not None and settings.imap_host:
            apr = _mailto_link(action_task_id, "APR", user.id)
            rej = _mailto_link(action_task_id, "REJ", user.id)
            email_body += (
                "\n\nСогласовать по почте (отправьте письмо):\n" + apr +
                "\n\nОтклонить по почте (укажите причину в теле письма):\n" + rej
            )
            html_body = _email_html(title, content, full_link, apr, rej)
        session.add(OutboundMessage(
            channel="EMAIL", recipient=user.email,
            subject=title, body=email_body, html_body=html_body,
        ))
    if user.telegram_chat_id and settings.telegram_bot_token:
        tg_body = text_body
        if full_link:
            tg_body += f"\n\nОткрыть документ: {full_link}"
        buttons = None
        if action_task_id is not None:
            buttons = [
                {"text": "✅ Согласовать", "callback_data": f"apr:{action_task_id}"},
                {"text": "❌ Отклонить", "callback_data": f"rej:{action_task_id}"},
            ]
        session.add(OutboundMessage(
            channel="TELEGRAM", recipient=str(user.telegram_chat_id),
            subject=None, body=tg_body, buttons=buttons,
        ))


# --- Согласование по почте: mailto-ссылки и HTML-письмо ---
# Клик по кнопке открывает готовое письмо на сервисный адрес; сервер
# опрашивает ящик по IMAP изнутри сети и выполняет действие по токену.
# Тема письма — ASCII, чтобы не ломалась MIME-кодировкой: "[BPM] APPROVE <token>".

def _mailto_link(task_id: uuid.UUID, action: str, user_id: uuid.UUID) -> str:
    token = create_email_action_token(task_id, action, user_id)
    verb = "APPROVE" if action == "APR" else "REJECT"
    subject = f"[BPM] {verb} {token}"
    if action == "APR":
        body = "Отправьте это письмо, чтобы согласовать документ."
    else:
        body = ("Причину отклонения напишите выше этой строки и отправьте "
                "письмо.\n---")
    return (
        f"mailto:{settings.service_email}"
        f"?subject={quote(subject)}&body={quote(body)}"
    )


def _email_html(title: str, content: str | None, link: str | None,
                apr: str, rej: str) -> str:
    body_html = escape(content or "").replace("\n", "<br>")
    link_html = (
        f'<p><a href="{escape(link)}">Открыть документ в системе</a></p>'
        if link else ""
    )
    return f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;max-width:600px">
  <h2 style="font-size:18px">{escape(title)}</h2>
  <p style="color:#475569">{body_html}</p>
  {link_html}
  <p style="margin-top:20px">
    <a href="{escape(apr)}" style="display:inline-block;padding:10px 22px;
       background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;
       margin-right:8px">✓ Согласовать</a>
    <a href="{escape(rej)}" style="display:inline-block;padding:10px 22px;
       background:#dc2626;color:#fff;text-decoration:none;border-radius:6px">
       ✗ Отклонить</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px">
    Кнопки формируют письмо на служебный адрес. Просто отправьте его —
    система обработает действие. При отклонении укажите причину в теле письма.
  </p>
</div>"""


# --- Отправка ---

def _send_email_sync(
    recipient: str, subject: str, body: str, html: str | None = None
) -> None:
    if html:
        message: MIMEText | MIMEMultipart = MIMEMultipart("alternative")
        message.attach(MIMEText(body, "plain", "utf-8"))
        message.attach(MIMEText(html, "html", "utf-8"))
    else:
        message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = formataddr(("BPM AL-BINA", settings.smtp_from))
    message["To"] = recipient
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_pass)
        smtp.sendmail(settings.smtp_from, [recipient], message.as_string())


def _send_plain_email(recipient: str, subject: str, body: str) -> None:
    """Служебное письмо-ответ (подтверждение/запрос причины)."""
    if settings.smtp_host and recipient:
        _send_email_sync(recipient, subject, body)


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
            _send_email_sync, message.recipient,
            message.subject or "BPM", message.body, message.html_body,
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


# --- Согласование по почте: приём ответов через IMAP ---

_SUBJECT_RE = re.compile(r"\[BPM\]\s+(APPROVE|REJECT)\s+([A-Za-z0-9._-]+)")


def _decode_str(raw) -> str:
    try:
        return str(make_header(decode_header(raw or "")))
    except Exception:  # noqa: BLE001
        return raw or ""


def _extract_body(message) -> str:
    """Текст письма без цитат и служебных строк — как комментарий."""
    text = ""
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                text = payload.decode(charset, errors="replace")
                break
    else:
        payload = message.get_payload(decode=True) or b""
        text = payload.decode(message.get_content_charset() or "utf-8", "replace")
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(">") or stripped == "---":
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _fetch_inbox_actions() -> list[dict]:
    """Синхронно: непрочитанные письма с токеном действия. Помечает
    прочитанными. Возвращает [{action, token, sender, comment}]."""
    actions: list[dict] = []
    connect = imaplib.IMAP4_SSL if settings.imap_ssl else imaplib.IMAP4
    imap = connect(settings.imap_host, settings.imap_port)
    try:
        imap.login(settings.imap_login, settings.imap_password)
        imap.select("INBOX")
        _, data = imap.search(None, "UNSEEN")
        for num in data[0].split():
            _, msg_data = imap.fetch(num, "(RFC822)")
            raw = msg_data[0][1]
            message = email_lib.message_from_bytes(raw)
            subject = _decode_str(message.get("Subject"))
            match = _SUBJECT_RE.search(subject)
            if not match:
                continue  # не наше письмо — не трогаем (даже флаг не ставим)
            imap.store(num, "+FLAGS", "\\Seen")
            sender = parseaddr(_decode_str(message.get("From")))[1].lower()
            actions.append({
                "action": "APR" if match.group(1) == "APPROVE" else "REJ",
                "token": match.group(2),
                "sender": sender,
                "comment": _extract_body(message) if match.group(1) == "REJECT" else "",
            })
    finally:
        try:
            imap.logout()
        except Exception:  # noqa: BLE001
            pass
    return actions


async def _apply_email_action(item: dict) -> None:
    try:
        payload = decode_email_action_token(item["token"])
    except pyjwt.PyJWTError:
        return  # просроченный/поддельный токен — игнор
    task_id = uuid.UUID(payload["tid"])
    user_id = uuid.UUID(payload["uid"])
    async with async_session() as session:
        user = await session.get(User, user_id)
        task = await session.get(Task, task_id)
        if user is None or task is None:
            return
        # письмо должно прийти с почты самого пользователя
        if not user.email or user.email.lower() != item["sender"]:
            logger.error(json.dumps({
                "event": "email_action_sender_mismatch",
                "expected": user.email, "got": item["sender"],
            }, ensure_ascii=False))
            return
        approve = item["action"] == "APR"
        comment = item["comment"] if not approve else "Согласовано по почте"
        if not approve and not comment.strip():
            _send_plain_email(
                user.email, "BPM: укажите причину отклонения",
                "Отклонение не выполнено: в письме не указана причина.\n"
                "Ответьте ещё раз, написав причину в теле письма.",
            )
            return
        try:
            await process_service.complete_task(
                session, task=task, user=user, approve=approve,
                comment=comment, ip="email",
            )
            verb = "согласован" if approve else "отклонён"
            _send_plain_email(
                user.email, f"BPM: документ {verb}",
                f"Ваше решение принято: документ {verb}.",
            )
        except Exception as exc:  # noqa: BLE001 — HTTPException с причиной
            detail = getattr(exc, "detail", str(exc))
            _send_plain_email(
                user.email, "BPM: действие не выполнено", f"Причина: {detail}",
            )


async def imap_poller() -> None:
    """Приём ответов согласования по почте. Работает изнутри сети —
    порты наружу не открываются."""
    while True:
        try:
            items = await asyncio.to_thread(_fetch_inbox_actions)
            for item in items:
                try:
                    await _apply_email_action(item)
                except Exception as exc:  # noqa: BLE001
                    logger.error(f'{{"event": "email_action_error", "error": "{exc}"}}')
        except Exception as exc:  # noqa: BLE001 — IMAP недоступен
            logger.error(f'{{"event": "imap_poll_error", "error": "{str(exc)[:200]}"}}')
        await asyncio.sleep(60)
