import asyncio
import json
import sys
import time
import traceback
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# psycopg async несовместим с ProactorEventLoop (Windows). Для uvicorn --reload
# политику ставит сам uvicorn; здесь — для TestClient и прочих точек входа
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from contextlib import asynccontextmanager

from app.api import admin, auth, documents, errors, notifications, processes, tasks
from app.api.errors import new_error_code, user_id_from_request
from app.api.routes import router
from app.core.config import settings
from app.core.logging_conf import get_logger


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Фоновые воркеры: доставка email/Telegram и Telegram-поллер."""
    workers: list[asyncio.Task] = []
    if settings.workers_enabled:
        from app.services.notify_delivery import (
            delivery_worker,
            imap_poller,
            telegram_poller,
        )

        if settings.smtp_host or settings.telegram_bot_token:
            workers.append(asyncio.create_task(delivery_worker()))
        if settings.telegram_bot_token:
            workers.append(asyncio.create_task(telegram_poller()))
        if settings.imap_host:
            workers.append(asyncio.create_task(imap_poller()))
    yield
    for worker in workers:
        worker.cancel()


app = FastAPI(title=settings.app_name, debug=False, lifespan=lifespan)

logger = get_logger()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    """request_id + JSON-лог каждого запроса (кто, что, сколько заняло)."""
    request_id = uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    user_id = user_id_from_request(request)
    logger.info(json.dumps({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
        "user_id": str(user_id) if user_id else None,
        "ip": request.client.host if request.client else None,
    }, ensure_ascii=False))
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Необработанное исключение: полный стек — в лог и журнал ошибок,
    пользователю — только код инцидента."""
    code = new_error_code()
    stack = "".join(traceback.format_exception(exc))
    logger.error(json.dumps({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "event": "unhandled_error",
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
        "method": request.method,
        "path": request.url.path,
        "message": str(exc),
        "traceback": stack,
    }, ensure_ascii=False))
    try:
        # отдельная сессия: рабочая могла умереть вместе с запросом
        from app.core.db import async_session
        from app.models import ErrorLog

        async with async_session() as session:
            session.add(
                ErrorLog(
                    code=code,
                    source="SERVER",
                    method=request.method,
                    path=str(request.url.path)[:500],
                    message=str(exc)[:2000] or exc.__class__.__name__,
                    traceback=stack,
                    user_id=user_id_from_request(request),
                    ip=request.client.host if request.client else None,
                )
            )
            await session.commit()
    except Exception:
        pass  # журнал недоступен — стек уже в файле
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Внутренняя ошибка сервера. Код инцидента: {code}",
            "error_code": code,
        },
    )


app.include_router(router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(documents.router)
app.include_router(documents.attachments_router)
app.include_router(tasks.router)
app.include_router(processes.router)
app.include_router(notifications.router)
app.include_router(errors.router)
