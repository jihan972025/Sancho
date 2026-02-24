import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.middleware.tunnel_guard import TunnelGuardMiddleware
from backend.middleware.rate_limiter import TunnelRateLimitMiddleware

from backend.api.routes_chat import router as chat_router
from backend.api.routes_file import router as file_router
from backend.api.routes_browser import router as browser_router
from backend.api.routes_settings import router as settings_router
from backend.api.routes_whatsapp import router as whatsapp_router
from backend.api.routes_telegram import router as telegram_router
from backend.api.routes_matrix import router as matrix_router
from backend.api.routes_slack import router as slack_router
from backend.api.routes_scheduler import router as scheduler_router
from backend.api.routes_memory import router as memory_router
from backend.api.routes_crypto import router as crypto_router
from backend.api.routes_logs import router as logs_router, log_handler
from backend.api.routes_conversation import router as conversation_router
from backend.api.routes_google_auth import router as google_auth_router
from backend.api.routes_outlook_auth import router as outlook_auth_router
from backend.api.routes_autotrading import router as autotrading_router
from backend.api.routes_voice import router as voice_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logging.getLogger().addHandler(log_handler)


@asynccontextmanager
async def lifespan(app):
    import asyncio
    from backend.scheduler.runner import start_scheduler, stop_scheduler
    from backend.conversation.summarizer import summarize_unsummarized_conversations

    start_scheduler()
    # Summarize any conversations that were missed (e.g. after force-close)
    asyncio.create_task(summarize_unsummarized_conversations())
    yield
    stop_scheduler()


app = FastAPI(title="Sancho Backend", version="1.0.29", lifespan=lifespan)

app.add_middleware(TunnelGuardMiddleware)
app.add_middleware(TunnelRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",     # Vite dev server
        "http://127.0.0.1:5173",
        "http://localhost:8765",     # Backend (voice app served locally)
        "http://127.0.0.1:8765",
        "null",                      # Electron file:// origin
    ],
    allow_origin_regex=r"https://[a-z0-9-]+\.trycloudflare\.com",  # Cloudflare tunnel
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(chat_router)
app.include_router(file_router)
app.include_router(browser_router)
app.include_router(settings_router)
app.include_router(whatsapp_router)
app.include_router(telegram_router)
app.include_router(matrix_router)
app.include_router(slack_router)
app.include_router(scheduler_router)
app.include_router(memory_router)
app.include_router(crypto_router)
app.include_router(logs_router)
app.include_router(conversation_router)
app.include_router(google_auth_router)
app.include_router(outlook_auth_router)
app.include_router(autotrading_router)
app.include_router(voice_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.29"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
