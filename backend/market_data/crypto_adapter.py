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
        interval = _BINANCE_INTERVALS.get(timeframe, "1h")
        binance_symbol = symbol.replace("/", "").upper()
        
        # 1. Binance se try karein (Sabse best)
        try:
            url = f"{_settings.binance_base_url}/api/v3/klines"
            params = {"symbol": binance_symbol, "interval": interval, "limit": min(limit, 1000)}
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url, params=params)
                if response.status_code == 200:
                    raw = response.json()
                    candles = [Candle(time=int(k[0]/1000), open=float(k[1]), high=float(k[2]), low=float(k[3]), close=float(k[4]), volume=float(k[5])) for k in raw]
                    return CandlesResult(symbol=symbol, market="crypto", timeframe=timeframe, source="binance", fetched_at=fetched_at, is_stale=False, candles=candles)
        except Exception as e:
            print(f"Binance failed for {symbol}: {e}")

        # 2. CoinGecko Fallback (Agar Binance block ho)
        try:
            # Saare major coins ka map
            coin_map = {
                "BTCUSDT": "bitcoin", "ETHUSDT": "ethereum", "SOLUSDT": "solana", 
                "BNBUSDT": "binancecoin", "XRPUSDT": "ripple", "ADAUSDT": "cardano", 
                "DOGEUSDT": "dogecoin", "MATICUSDT": "matic-network", "DOTUSDT": "polkadot", 
                "AVAXUSDT": "avalanche-2", "LINKUSDT": "chainlink", "LTCUSDT": "litecoin",
                "SHIBUSDT": "shiba-inu", "TRXUSDT": "tron", "UNIUSDT": "uniswap"
            }
            coin_id = coin_map.get(binance_symbol)
            
            if coin_id:
                cg_url = f"{_settings.coingecko_base_url}/coins/{coin_id}/ohlc"
                cg_params = {"vs_currency": "usd", "days": "1" if timeframe in ["1m","5m","15m","1h"] else "7"}
                
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(cg_url, params=cg_params)
                    if res.status_code == 200:
                        raw = res.json()
                        candles = [Candle(time=int(k[0]/1000), open=float(k[1]), high=float(k[2]), low=float(k[3]), close=float(k[4]), volume=0.0) for k in raw[-limit:]]
                        return CandlesResult(symbol=symbol, market="crypto", timeframe=timeframe, source="coingecko_fallback", fetched_at=fetched_at, is_stale=True, candles=candles)
        except Exception as e:
            print(f"CoinGecko failed for {symbol}: {e}")

        return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason="Market data unavailable for this coin.", fetched_at=fetched_at)