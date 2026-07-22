"""Абстракция хранилища файлов: локальный диск или S3-совместимое облако.

Выбор — settings.storage_backend (local | s3). S3-вариант через boto3
покрывает AWS, MinIO, Yandex Object Storage, VK Cloud и другие
S3-совместимые сервисы (для не-AWS задаётся s3_endpoint_url).
"""
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.core.config import BASE_DIR, settings


class StorageError(Exception):
    pass


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
    def __init__(self):
        import boto3  # ленивый импорт: нужен только при storage_backend=s3

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
            region_name=settings.s3_region,
        )
        self.bucket = settings.s3_bucket

    def save(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def load(self, key: str) -> bytes:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            raise StorageError("Файл не найден в хранилище")

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


@lru_cache(maxsize=1)
def get_storage() -> Storage:
    if settings.storage_backend == "s3":
        return S3Storage()
    local = Path(settings.storage_local_path)
    if not local.is_absolute():
        local = BASE_DIR / local
    return LocalStorage(local)
