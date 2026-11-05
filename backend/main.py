"""
FastAPI application entrypoint.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded

from backend.config import get_settings
from backend.database import engine, init_db
from backend.schemas import HealthResponse
from backend.models import User
from backend.auth.telegram import get_current_user
from backend.middleware.rate_limit import limiter, _rate_limit_exceeded_handler
from backend.routers import market as market_router
from backend.routers import signals as signals_router
from backend.routers import paper as paper_router
from backend.bot.application import get_bot_application

# ---------- Logging ----------
_settings = get_settings()
logging.basicConfig(level=_settings.log_level, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("trading-terminal")

# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        logger.info("Database tables ensured")
    except Exception as exc:
        logger.exception("Database initialization failed: %s", exc)

    # Start Telegram Bot
    bot_app = get_bot_application()
    if bot_app:
        logger.info("Starting Telegram Bot...")
        await bot_app.initialize()
        await bot_app.start()
        await bot_app.updater.start_polling()
    yield
    # Stop Bot
    if bot_app:
        await bot_app.updater.stop()
        await bot_app.stop()
        await bot_app.shutdown()

# ---------- App factory ----------
def create_app() -> FastAPI:
    app = FastAPI(
        title=_settings.app_name,
        version=_settings.app_version,
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_settings.allowed_origins_list, 
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- HEALTH ROUTE (UptimeRobot ke liye) ---
    @app.get("/health", tags=["health"])
    @app.head("/health", tags=["health"])  # HEAD method bhi accept karega
    async def health_simple():
        return {"status": "ok"}

    @app.get("/api/health", response_model=HealthResponse, tags=["health"])
    async def health_detailed():
        db_status = "ok"
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception as exc:
            db_status = f"error: {exc.__class__.__name__}"
        return HealthResponse(
            status="ok" if db_status == "ok" else "degraded",
            app_name=_settings.app_name,
            app_version=_settings.app_version,
            environment=_settings.app_env,
            database=db_status,
            timestamp=datetime.now(timezone.utc),
        )

    @app.get("/api/me", tags=["user"])
    async def get_me(current_user: User = Depends(get_current_user)):
        return {"id": current_user.id, "telegram_id": current_user.telegram_id}

    # Routers
    app.include_router(market_router.router)
    app.include_router(signals_router.router)
    app.include_router(paper_router.router)
    return app

app = create_app()