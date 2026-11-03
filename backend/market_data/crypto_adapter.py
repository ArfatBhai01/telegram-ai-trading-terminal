"""
Crypto market data adapter.
Tries Binance first (best data). Falls back to CoinGecko if Binance is blocked.
"""
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
            return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason="Unsupported timeframe", fetched_at=fetched_at)

        binance_symbol = symbol.replace("/", "").upper()
        
        # --- TRY BINANCE FIRST ---
        try:
            url = f"{_settings.binance_base_url}/api/v3/klines"
            params = {"symbol": binance_symbol, "interval": interval, "limit": min(limit, 1000)}
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                
                if response.status_code == 200:
                    raw = response.json()
                    candles = []
                    for k in raw:
                        candles.append(Candle(
                            time=int(k[0] / 1000), open=float(k[1]), high=float(k[2]), 
                            low=float(k[3]), close=float(k[4]), volume=float(k[5])
                        ))
                    return CandlesResult(
                        symbol=symbol, market="crypto", timeframe=timeframe, 
                        source="binance", fetched_at=fetched_at, is_stale=False, candles=candles
                    )
        except Exception as e:
            print(f"Binance failed, trying CoinGecko: {e}")

        # --- FALLBACK TO COINGECKO ---
        try:
            # CoinGecko uses different symbol names (e.g., BTCUSDT -> bitcoin)
            coin_map = {
                "BTCUSDT": "bitcoin", "ETHUSDT": "ethereum", "SOLUSDT": "solana",
                "BNBUSDT": "binancecoin", "XRPUSDT": "ripple", "ADAUSDT": "cardano",
                "DOGEUSDT": "dogecoin", "DOTUSDT": "polkadot", "AVAXUSDT": "avalanche-2",
                "LINKUSDT": "chainlink", "MATICUSDT": "matic-network"
            }
            
            coin_id = coin_map.get(binance_symbol)
            if not coin_id:
                return UnavailableResult(symbol=symbol, market="crypto", timeframe=timeframe, reason="Symbol not supported by fallback", fetched_at=fetched_at)

            # CoinGecko OHLC endpoint (Note: returns 4 values per candle: time, open, high, low, close)
            cg_url = f"{_settings.coingecko_base_url}/coins/{coin_id}/ohlc"
            cg_params = {"vs_currency": "usd", "days": "1" if timeframe in ["1m","5m","15m","1h"] else "7"}
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(cg_url, params=cg_params)
                if res.status_code == 200:
                    raw = res.json()
                    candles = []
                    # CoinGecko gives [time, open, high, low, close]
                    for k in raw[-limit:]: 
                        candles.append(Candle(
                            time=int(k[0] / 1000), open=float(k[1]), high=float(k[2]), 
                            low=float(k[3]), close=float(k[4]), volume=0.0 # CG OHLC doesn't give volume easily
                        ))
                    
                    return CandlesResult(
                        symbol=symbol, market="crypto", timeframe=timeframe, 
                        source="coingecko_fallback", fetched_at=fetched_at, is_stale=True, candles=candles
                    )
        except Exception as e:
            print(f"CoinGecko also failed: {e}")

        # --- BOTH FAILED ---
        return UnavailableResult(
            symbol=symbol, market="crypto", timeframe=timeframe, 
            reason="Both Binance and CoinGecko are unavailable. Network or geo-block issue.", 
            fetched_at=fetched_at
        )