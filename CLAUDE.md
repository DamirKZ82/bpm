# BPM — система согласования документов

Электронное согласование внутренних документов (служебные записки, заявки
на договор/оплату) для строительной компании (Казахстан, UTC+5).
Полное ТЗ: `docs/bpm-tz.md` — читать перед любой архитектурной работой.

## Стек

- `backend/` — Python 3.14, FastAPI, SQLAlchemy 2 (async, psycopg), Alembic, PostgreSQL 15 (локальный, без Docker)
- `frontend/` — React + Vite (TypeScript), MUI v7 + MUI X DataGrid (системные
  пропсы недоступны — всё через `sx`); тема в `src/theme.ts`
- Интеграции: 1С:ЗУП и 1С:Бухгалтерия (HTTP/JSON), AD/LDAP через Keycloak (OIDC)
- Собственный движок маршрутов на матрице — Camunda/Flowable сознательно не используем

## Команды

```powershell
# бэкенд (из backend/)
.venv\Scripts\activate
uvicorn app.main:app --reload      # http://localhost:8000, /docs
alembic upgrade head
alembic revision --autogenerate -m "..."

# фронтенд (из frontend/)
npm run dev                        # http://localhost:5173

# сид dev-админа и сквозной тест (из backend/, пишет в реальную БД!)
.venv\Scripts\python.exe scripts\seed_dev.py
.venv\Scripts\python.exe scripts\smoke_e2e.py   # TRUNCATE всех таблиц + прогон
```

## Dev-режим (пока нет Keycloak/AD/1С)

- Вход: `POST /api/auth/dev-login {"username": "admin"}` — без пароля
  (auth_mode=dev в конфиге); Bearer-токен в заголовке
- Справочники ведутся вручную админом: `/api/admin/*` (organizations,
  positions, departments, employees, employments, absences, projects,
  project-assignments, substitutions, route-rules, users)
- Тестовые пользователи создаются через `/api/admin/users` и привязываются
  к сотрудникам (`employee_id`); без привязки создание заявок запрещено
- uvicorn на Windows запускать с `--reload` (иначе ProactorEventLoop
  несовместим с psycopg async; в app/main.py стоит подстраховка)
- INITIATOR_MANAGER и PROJECT_MANAGER в route_rules пока не реализованы

## Ключевые решения (из ТЗ, не менять без обсуждения)

- Маршрут вычисляется из матрицы `route_rules`: вид объекта × организация ×
  проект; NULL в измерении = «любой»; конфликты решает `priority`
  (модель замещения, не дополнения)
- При старте процесса маршрут фиксируется в `process_instances.route_snapshot` —
  правки матрицы не влияют на запущенные процессы
- Задачи адресуются должностям (`positions`), не людям
- Сопоставление людей/организаций — только по GUID/БИН/ИИН, никогда по ФИО
- БИН — строка фиксированной длины, не число (ведущие нули)
- `PENDING_EXPORT` — отдельный статус процесса (не подсостояние APPROVED)
- Исходящий обмен с 1С — только через `integration_outbox` + `idempotency_key`
- Сотрудники не удаляются никогда (упор на upsert со статусом)
- Роли храним в BPM, не в группах AD
- `external_mapping` всегда с `system` в ключе (GUID ЗУП ≠ GUID БУХ)

## Конвенции

- Модели: `app/models/`, разбиты по доменам (directory / routing / process /
  domain / integration), enum'ы в `enums.py`, PK — UUID
- Настройки: `app/core/config.py` (pydantic-settings, `.env`, extra="ignore")
- `.env` не коммитится; содержит DB_PASS, SMTP_*, TELEGRAM_BOT_TOKEN
- Уведомления вовне: очередь outbound_messages + фоновые воркеры в lifespan
  (`app/services/notify_delivery.py`) — email по SMTP и Telegram-бот
  (long polling, наружу порты не открываются). Кнопки в Telegram позволяют
  согласовать/отклонить с телефона; привязка — код из меню пользователя
- Файлы-вложения: `app/services/storage.py` (local | s3, любое S3-совместимое
  через boto3). Конфигурация — в БД (app_settings, ключ storage), правится
  админом на странице «Настройки BPM»; .env — только значения по умолчанию.
  Локальные файлы — в backend/storage/ (в .gitignore). В 1С передаются
  только ссылки (ТЗ §8.7)
- Виды документов — динамические (document_types + конструктор полей
  document_type_fields, admin UI «Виды документов»): стандартная шапка
  (номер/дата/организация/проект/тема/содержание/вложения) — колонки
  таблицы documents, настраиваемые поля — в documents.custom_fields (JSONB),
  валидация по описаниям на API. Ссылочные поля: сотрудники/организации/
  проекты/пользовательские справочники (dictionaries). object_type везде —
  строковый code вида. Системный вид MEMO не удаляется; сид — seed_dev.py
- Обязательные реквизиты документа: номер (автонумерация — счётчик
  last_number на виде, формат ПРЕФИКС-NNNNNN), дата, организация, проект.
  Организация/проект обязательны на уровне API, в БД nullable

## Порядок внедрения (ТЗ §12)

0. Аудит данных AD↔ЗУП → 1. Аутентификация → 2. Справочники →
3. Служебная записка (фиксированный маршрут) → 4. Матрица + тестировщик →
5. Договоры/контрагенты/outbox → 6. Обратная связь с БУХ → 7. Метрики

Не начинать с заявки на договор — сначала базовая механика на служебках.
