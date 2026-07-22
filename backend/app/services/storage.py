"""Абстракция хранилища файлов: локальный диск или S3-совместимое облако.

Конфигурация хранится в БД (app_settings, ключ "storage") и редактируется
администратором на странице «Настройки BPM»; значения из .env служат
значениями по умолчанию. S3-вариант через boto3 покрывает AWS, MinIO,
Yandex Object Storage и другие S3-совместимые сервисы.
"""
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BASE_DIR, settings
from app.models import AppSetting

STORAGE_SETTINGS_KEY = "storage"


class StorageError(Exception):
    pass


class StorageConfig(BaseModel):
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_path: str = "storage"
    max_upload_mb: int = 50
    s3_endpoint_url: str = ""
    s3_bucket: str = "bpm"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"


def _env_defaults() -> dict:
    return {
        "storage_backend": settings.storage_backend,
        "storage_local_path": settings.storage_local_path,
        "max_upload_mb": settings.max_upload_mb,
        "s3_endpoint_url": settings.s3_endpoint_url,
        "s3_bucket": settings.s3_bucket,
        "s3_access_key": settings.s3_access_key,
        "s3_secret_key": settings.s3_secret_key,
        "s3_region": settings.s3_region,
    }


async def load_storage_config(session: AsyncSession) -> StorageConfig:
    data = _env_defaults()
    row = await session.get(AppSetting, STORAGE_SETTINGS_KEY)
    if row is not None:
        data.update({k: v for k, v in row.value.items() if v is not None})
    return StorageConfig(**data)


async def save_storage_config(
    session: AsyncSession, config: StorageConfig
) -> None:
    row = await session.get(AppSetting, STORAGE_SETTINGS_KEY)
    if row is None:
        session.add(AppSetting(key=STORAGE_SETTINGS_KEY, value=config.model_dump()))
    else:
        row.value = config.model_dump()
    await session.commit()


class Storage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...
    def load(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, base: Path):
        self.base = base

    def _path(self, key: str) -> Path:
        path = (self.base / key).resolve()
        if not path.is_relative_to(self.base.resolve()):
            raise StorageError("Недопустимый ключ файла")
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def load(self, key: str) -> bytes:
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError:
            raise StorageError("Файл не найден в хранилище")

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class S3Storage:
    def __init__(self, config: StorageConfig):
        import boto3  # ленивый импорт: нужен только при storage_backend=s3

        self.client = boto3.client(
            "s3",
            endpoint_url=config.s3_endpoint_url or None,
            aws_access_key_id=config.s3_access_key or None,
            aws_secret_access_key=config.s3_secret_key or None,
            region_name=config.s3_region,
        )
        self.bucket = config.s3_bucket

    def save(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def load(self, key: str) -> bytes:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            raise StorageError("Файл не найден в хранилище")

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


# кэш по конфигурации: боto3-клиент не пересоздаётся на каждый запрос
_cache: tuple[tuple, Storage] | None = None


def build_storage(config: StorageConfig) -> Storage:
    global _cache
    cache_key = tuple(config.model_dump().values())
    if _cache is not None and _cache[0] == cache_key:
        return _cache[1]
    if config.storage_backend == "s3":
        storage: Storage = S3Storage(config)
    else:
        local = Path(config.storage_local_path)
        if not local.is_absolute():
            local = BASE_DIR / local
        storage = LocalStorage(local)
    _cache = (cache_key, storage)
    return storage


async def get_storage(session: AsyncSession) -> Storage:
    return build_storage(await load_storage_config(session))
