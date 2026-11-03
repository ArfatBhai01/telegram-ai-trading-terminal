from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal

MarketType = Literal["crypto", "india", "forex"]
Timeframe = Literal["1m", "5m", "15m", "1h", "4h", "1d"]

@dataclass
class Candle:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

@dataclass
class CandlesResult:
    symbol: str
    market: MarketType
    timeframe: Timeframe
    source: str
    fetched_at: datetime
    is_stale: bool
    candles: List[Candle]

@dataclass
class UnavailableResult:
    symbol: str
    market: MarketType
    timeframe: Timeframe
    reason: str
    fetched_at: datetime

MarketDataResult = CandlesResult | UnavailableResult