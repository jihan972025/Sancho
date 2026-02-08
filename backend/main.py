import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes_chat import router as chat_router
from backend.api.routes_file import router as file_router
from backend.api.routes_browser import router as browser_router
from backend.api.routes_settings import router as settings_router
from backend.api.routes_whatsapp import router as whatsapp_router
from backend.api.routes_telegram import router as telegram_router
from backend.api.routes_matrix import router as matrix_router
from backend.api.routes_scheduler import router as scheduler_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)


@asynccontextmanager
async def lifespan(app):
    from backend.scheduler.runner import start_scheduler, stop_scheduler
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Sancho Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(file_router)
app.include_router(browser_router)
app.include_router(settings_router)
app.include_router(whatsapp_router)
app.include_router(telegram_router)
app.include_router(matrix_router)
app.include_router(scheduler_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
