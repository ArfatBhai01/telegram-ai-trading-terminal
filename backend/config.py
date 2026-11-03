"""
Centralized configuration loaded from environment variables.
"""
from functools import lru_cache
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Core
    app_env: str = Field(default="development")
    app_name: str = Field(default="Telegram AI Trading Terminal")
    app_version: str = Field(default="0.1.0")
    log_level: str = Field(default="INFO")
    backend_public_url: str = Field(default="http://127.0.0.1:8000")
    allowed_origins: str = Field(default="http://127.0.0.1:5500,http://127.0.0.1:8000")

    # Database
    database_url: str = Field(default="sqlite:///./trading.db")

    # Telegram
    telegram_bot_token: Optional[str] = Field(default=None)
    telegram_miniapp_url: Optional[str] = Field(default=None)
    admin_telegram_ids: str = Field(default="")
    telegram_webhook_secret: Optional[str] = Field(default=None)

    # Market data
    binance_base_url: str = Field(default="https://api.binance.com")
    coingecko_base_url: str = Field(default="https://api.coingecko.com/api/v3")
    india_equity_enabled: bool = Field(default=False)
    forex_enabled: bool = Field(default=True)
    market_http_timeout: int = Field(default=10)

    # Signal engine
    strategy_version: str = Field(default="1.0.0")
    min_candles_required: int = Field(default=250)

    # AI
    ai_provider: str = Field(default="noop")
    ai_api_key: Optional[str] = Field(default=None)
    ai_base_url: Optional[str] = Field(default=None)
    ai_model: Optional[str] = Field(default=None)

    # Retention
    signal_log_retention_days: int = Field(default=30)
    paper_trade_retention_days: int = Field(default=90)
    session_retention_days: int = Field(default=7)

    # Rate limits
    rate_limit_per_minute: int = Field(default=60)
    rate_limit_admin_per_minute: int = Field(default=30)

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        v_up = v.upper()
        if v_up not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}")
        return v_up

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def admin_telegram_ids_list(self) -> List[int]:
        ids: List[int] = []
        for raw in self.admin_telegram_ids.split(","):
            raw = raw.strip()
            if not raw: continue
            try: ids.append(int(raw))
            except ValueError: pass
        return ids

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

@lru_cache
def get_settings() -> Settings:
    return Settings()