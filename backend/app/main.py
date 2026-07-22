import asyncio
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# psycopg async несовместим с ProactorEventLoop (Windows). Для uvicorn --reload
# политику ставит сам uvicorn; здесь — для TestClient и прочих точек входа
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.api import admin, auth, documents, processes, tasks
from app.api.routes import router
from app.core.config import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(documents.router)
app.include_router(documents.attachments_router)
app.include_router(tasks.router)
app.include_router(processes.router)
