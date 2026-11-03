from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query, status
from backend.market_data.registry import get_adapter, is_symbol_valid, SUPPORTED_CRYPTO_SYMBOLS
from backend.market_data.types import CandlesResult, MarketType, Timeframe, UnavailableResult
from backend.schemas import Candle as CandleSchema
from backend.schemas import CandlesResponse, UnavailableResponse

router = APIRouter(prefix="/api/market", tags=["market"])

@router.get("/symbols")
async def list_symbols():
    return {"crypto": sorted(SUPPORTED_CRYPTO_SYMBOLS), "india": [], "forex": []}

@router.get("/candles", response_model=None)
async def get_candles(symbol: str = Query(...), market: MarketType = Query(...), timeframe: Timeframe = Query("1h"), limit: int = Query(500)):
    if not is_symbol_valid(market, symbol):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported symbol '{symbol}'.")
    
    adapter = get_adapter(market)
    
    # Yahan humne try-except lagaya hai taaki server crash na ho
    try:
        result = await adapter.fetch_candles(symbol.upper(), timeframe, limit)
    except Exception as e:
        return UnavailableResponse(symbol=symbol, market=market, timeframe=timeframe, reason=str(e), fetched_at=__import__('datetime').datetime.now(__import__('datetime').timezone.utc))

    if isinstance(result, CandlesResult):
        return CandlesResponse(symbol=result.symbol, market=result.market, timeframe=result.timeframe, source=result.source, fetched_at=result.fetched_at, is_stale=result.is_stale, candles=[CandleSchema(**vars(c)) for c in result.candles])
    
    return UnavailableResponse(symbol=result.symbol, market=result.market, timeframe=result.timeframe, reason=result.reason, fetched_at=result.fetched_at)