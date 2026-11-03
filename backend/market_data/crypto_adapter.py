from __future__ import annotations
from datetime import datetime, timezone
from typing import List
import httpx
from backend.config import get_settings
from backend.market_data.base import MarketDataAdapter
from backend.market_data.types import Candle, CandlesResult, MarketDataResult, Timeframe, UnavailableResult

_settings = get_settings()
_BINANCE_INTERVALS = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}

class CryptoAdapter(MarketDataAdapter):
    @property
    def market_name(self) -> str:
        return "crypto"

    async def fetch_candles(self, symbol: str, timeframe: Timeframe, limit: int = 500) -> MarketDataResult:
        fetched_at = datetime.now(timezone.utc)
        interval = _BINANCE_INTERVALS.get(timeframe)
        if not interval:
            return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason=f"Unsupported timeframe: {timeframe}", fetched_at=fetched_at)

        binance_symbol = symbol.replace("/", "").upper()
        url = f"{_settings.binance_base_url}/api/v3/klines"
        params = {"symbol": binance_symbol, "interval": interval, "limit": min(limit, 1000)}

        try:
            async with httpx.AsyncClient(timeout=_settings.market_http_timeout) as client:
                response = await client.get(url, params=params)
                if response.status_code != 200:
                    return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason=f"Binance HTTP {response.status_code}", fetched_at=fetched_at)
                raw = response.json()
        except Exception as exc:
            return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason=f"Network error: {exc.__class__.__name__}", fetched_at=fetched_at)

        if not raw:
            return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason="Empty data from Binance", fetched_at=fetched_at)

        candles = []
        for k in raw:
            try:
                candles.append(Candle(time=int(k[0] / 1000), open=float(k[1]), high=float(k[2]), low=float(k[3]), close=float(k[4]), volume=float(k[5])))
            except: continue

        return CandlesResult(symbol=symbol, market="crypto", timeframe=timeframe, source="binance_public_api", fetched_at=fetched_at, is_stale=False, candles=candles)