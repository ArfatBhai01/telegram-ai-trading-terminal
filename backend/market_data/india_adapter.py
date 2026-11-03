from __future__ import annotations
from datetime import datetime, timezone
from backend.config import get_settings
from backend.market_data.base import MarketDataAdapter
from backend.market_data.types import MarketDataResult, Timeframe, UnavailableResult

_settings = get_settings()

class IndiaAdapter(MarketDataAdapter):
    @property
    def market_name(self) -> str:
        return "india"

    async def fetch_candles(self, symbol: str, timeframe: Timeframe, limit: int = 500) -> MarketDataResult:
        now = datetime.now(timezone.utc)
        return UnavailableResult(symbol=symbol, market="india", timeframe=timeframe, reason="No reliable free public API for NSE intraday candles.", fetched_at=now)