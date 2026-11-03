"""
Pydantic schemas (API request/response models).
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

# =========================================================
# Health
# =========================================================
class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' or 'degraded'")
    app_name: str
    app_version: str
    environment: str
    database: str = Field(..., description="'ok' or error message")
    timestamp: datetime

# =========================================================
# Market data (Phase 3)
# =========================================================
MarketType = Literal["crypto", "india", "forex"]
Timeframe = Literal["1m", "5m", "15m", "1h", "4h", "1d"]
SignalAction = Literal["BUY", "SELL", "WAIT", "NO_TRADE"]

class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

class CandlesResponse(BaseModel):
    symbol: str
    market: MarketType
    timeframe: Timeframe
    source: str
    fetched_at: datetime
    is_stale: bool
    candles: List[Candle]

class UnavailableResponse(BaseModel):
    symbol: str
    market: MarketType
    timeframe: Timeframe
    status: Literal["DATA_UNAVAILABLE"] = "DATA_UNAVAILABLE"
    reason: str
    fetched_at: datetime

# =========================================================
# Signals (Phase 4/5)
# =========================================================
class IndicatorReadings(BaseModel):
    ema9: Optional[float] = None
    ema21: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None
    rsi14: Optional[float] = None
    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    atr14: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    volume_ratio: Optional[float] = None

class Signal(BaseModel):
    symbol: str
    exchange: str
    market: MarketType
    timeframe: Timeframe
    action: SignalAction
    entry_zone: Optional[List[float]] = None
    stop_loss: Optional[float] = None
    take_profits: Optional[List[float]] = None
    risk_reward: Optional[float] = None
    indicators: IndicatorReadings
    reasons: List[str]
    invalidation: List[str]
    data_source: str
    strategy_version: str
    generated_at: datetime

# =========================================================
# Paper trading (Phase 6)
# =========================================================
class PaperAccountOut(BaseModel):
    id: int
    currency: str
    balance: float
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class PaperTradeOut(BaseModel):
    id: int
    symbol: str
    market: MarketType
    side: Literal["BUY", "SELL"]
    entry_price: float
    quantity: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    exit_price: Optional[float] = None
    realized_pnl: Optional[float] = None
    status: Literal["OPEN", "CLOSED"]
    opened_at: datetime
    closed_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

# =========================================================
# Admin
# =========================================================
class CleanupResult(BaseModel):
    deleted_signal_logs: int
    deleted_paper_trades: int
    deleted_sessions: int
    ran_at: datetime

class AdminStats(BaseModel):
    total_users: int
    total_paper_accounts: int
    total_open_trades: int
    total_signal_logs: int
    generated_at: datetime
    extra: Dict[str, Any] = {}