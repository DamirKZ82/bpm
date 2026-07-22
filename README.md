# BPM

Система электронного согласования внутренних документов: служебные записки,
заявки на договор, заявки на оплату. Маршруты вычисляются из матрицы
(вид объекта × организация × проект), исполнители — по должностям из 1С:ЗУП.

Техническое задание: [docs/bpm-tz.md](docs/bpm-tz.md)

## Структура

- `backend/` — API на Python + FastAPI, PostgreSQL, SQLAlchemy + Alembic
- `frontend/` — SPA на React + Vite (TypeScript)
- `docs/` — ТЗ и проектная документация

## Запуск бэкенда

```
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload
```

API: http://localhost:8000, документация: http://localhost:8000/docs

## Запуск фронтенда

```
cd frontend
npm run dev
```

Приложение: http://localhost:5173
