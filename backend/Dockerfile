# Бэкенд BPM: FastAPI + миграции Alembic при старте.
FROM python:3.14-slim

WORKDIR /app

# зависимости отдельным слоем — кэшируются, пока не меняется requirements.txt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# при запуске: применить миграции, затем поднять сервер
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
