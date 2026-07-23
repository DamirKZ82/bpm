"""JSON-логи запросов и ошибок в файл с ротацией (backend/logs/app.log)."""
import logging
from logging.handlers import RotatingFileHandler

from app.core.config import BASE_DIR

_LOGGER_NAME = "bpm"


def get_logger() -> logging.Logger:
    logger = logging.getLogger(_LOGGER_NAME)
    if not logger.handlers:
        log_dir = BASE_DIR / "logs"
        log_dir.mkdir(exist_ok=True)
        handler = RotatingFileHandler(
            log_dir / "app.log",
            maxBytes=10_000_000,
            backupCount=5,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger
