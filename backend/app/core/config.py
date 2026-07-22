from pathlib import Path
from urllib.parse import quote

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — чтобы .env находился при запуске из любого каталога
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # extra="ignore": в .env могут лежать ключи (SMTP, Telegram и т.д.),
    # которые ещё не описаны здесь — добавляйте поля по мере надобности
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "BPM API"
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:5173"]

    # dev: вход по имени пользователя без пароля (POST /api/auth/dev-login);
    # oidc: Keycloak → AD, будет реализовано на этапе 1 внедрения по ТЗ
    auth_mode: str = "dev"
    jwt_secret: str = "dev-only-secret-change-me-in-prod-0123456789"
    jwt_ttl_hours: int = 12

    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "postgres"
    db_pass: str = ""
    db_name: str = "bpm"
    db_echo: bool = False

    # Хранилище файлов (ТЗ §8.7: файлы в BPM, в 1С — только ссылки).
    # local — папка на диске; s3 — любое S3-совместимое хранилище
    # (AWS, MinIO, Yandex Object Storage, VK Cloud): для не-AWS задайте
    # s3_endpoint_url. Переключение — в backend/.env
    storage_backend: str = "local"  # local | s3
    storage_local_path: str = "storage"  # относительно backend/
    max_upload_mb: int = 50
    s3_endpoint_url: str = ""  # пусто = AWS
    s3_bucket: str = "bpm"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    @property
    def database_url(self) -> str:
        # quote: пароль может содержать @, / и другие спецсимволы URL
        return (
            f"postgresql+psycopg://{quote(self.db_user)}:{quote(self.db_pass, safe='')}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()
