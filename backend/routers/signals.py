from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, status

from backend.market_data.registry import get_adapter, is_symbol_valid
from backend.market_data.types import CandlesResult, MarketType, Timeframe
from backend.engine.strategy_v1 import StrategyV1
from backend.schemas import Signal, IndicatorReadings

router = APIRouter(prefix="/api/signals", tags=["signals"])
strategy = StrategyV1()

@router.get("/analyze", response_model=Signal)
async def analyze_signal(
    symbol: str = Query(..., min_length=2, max_length=20),
    market: MarketType = Query("crypto"),
    timeframe: Timeframe = Query("1h"),
):
    if not is_symbol_valid(market, symbol):
        raise HTTPException(status_code=400, detail="Invalid symbol.")
        
    adapter = get_adapter(market)
    result = await adapter.fetch_candles(symbol.upper(), timeframe, limit=300) # Need 200+ for EMA200
    
    if not isinstance(result, CandlesResult):
        raise HTTPException(status_code=503, detail=f"DATA_UNAVAILABLE: {result.reason}")
        
    if len(result.candles) < 200:
        raise HTTPException(status_code=400, detail="Not enough candle data to analyze.")

    # Run Strategy
    analysis = strategy.analyze(result.candles)
    
    # Build Response Schema
    ind = IndicatorReadings(
        ema9=analysis.indicators.get("ema9"),
        ema21=analysis.indicators.get("ema21"),
        ema50=analysis.indicators.get("ema50"),
        ema200=analysis.indicators.get("ema200"),
        rsi14=analysis.indicators.get("rsi14"),
        atr14=analysis.indicators.get("atr14")
    )

    return Signal(
        symbol=symbol.upper(),
        exchange="binance" if market == "crypto" else market,
        market=market,
        timeframe=timeframe,
        action=analysis.action,
        entry_zone=analysis.entry_zone,
        stop_loss=analysis.stop_loss,
        take_profits=analysis.take_profits,
        risk_reward=2.0 if analysis.action in ("BUY", "SELL") else None,
        indicators=ind,
        reasons=analysis.reasons,
        invalidation=analysis.invalidation,
        data_source=result.source,
        strategy_version=strategy.version,
        generated_at=datetime.now(timezone.utc)
    )