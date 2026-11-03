from __future__ import annotations
from abc import ABC, abstractmethod
from backend.market_data.types import MarketDataResult, Timeframe

class MarketDataAdapter(ABC):
    @property
    @abstractmethod
    def market_name(self) -> str:
        pass

    @abstractmethod
    async def fetch_candles(
        self, symbol: str, timeframe: Timeframe, limit: int = 500
    ) -> MarketDataResult:
        pass