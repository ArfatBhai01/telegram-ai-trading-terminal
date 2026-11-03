from __future__ import annotations
from typing import Dict
from backend.market_data.base import MarketDataAdapter
from backend.market_data.crypto_adapter import CryptoAdapter
from backend.market_data.forex_adapter import ForexAdapter
from backend.market_data.india_adapter import IndiaAdapter
from backend.market_data.types import MarketType

_ADAPTERS: Dict[MarketType, MarketDataAdapter] = {
    "crypto": CryptoAdapter(),
    "india": IndiaAdapter(),
    "forex": ForexAdapter(),
}

SUPPORTED_CRYPTO_SYMBOLS = {"BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "MATIC/USDT", "DOT/USDT", "AVAX/USDT", "LINK/USDT"}

def get_adapter(market: MarketType) -> MarketDataAdapter:
    return _ADAPTERS[market]

def is_symbol_valid(market: MarketType, symbol: str) -> bool:
    if not symbol or len(symbol) > 20: return False
    if market == "crypto": return symbol.upper() in SUPPORTED_CRYPTO_SYMBOLS
    return market in ("india", "forex")