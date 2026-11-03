"""
Deterministic technical indicators.
Pure Python implementation. No paid API required.
"""
from __future__ import annotations
from typing import List, Optional

def calculate_ema(prices: List[float], period: int) -> List[Optional[float]]:
    """Exponential Moving Average."""
    if len(prices) < period:
        return [None] * len(prices)
    
    ema: List[Optional[float]] = [None] * (period - 1)
    multiplier = 2 / (period + 1)
    
    # First EMA is SMA
    sma = sum(prices[:period]) / period
    ema.append(sma)
    
    for price in prices[period:]:
        prev_ema = ema[-1]
        if prev_ema is None: continue
        current_ema = (price - prev_ema) * multiplier + prev_ema
        ema.append(current_ema)
        
    return ema

def calculate_rsi(prices: List[float], period: int = 14) -> List[Optional[float]]:
    """Relative Strength Index."""
    if len(prices) <= period:
        return [None] * len(prices)
        
    rsi: List[Optional[float]] = [None] * period
    gains = []
    losses = []
    
    for i in range(1, period + 1):
        change = prices[i] - prices[i - 1]
        if change > 0:
            gains.append(change)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(change))
            
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    
    if avg_loss == 0:
        rsi.append(100.0)
    else:
        rs = avg_gain / avg_loss
        rsi.append(100.0 - (100.0 / (1.0 + rs)))
        
    for i in range(period + 1, len(prices)):
        change = prices[i] - prices[i - 1]
        gain = max(change, 0)
        loss = max(-change, 0)
        
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        
        if avg_loss == 0:
            rsi.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsi.append(100.0 - (100.0 / (1.0 + rs)))
            
    return rsi

def calculate_atr(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> List[Optional[float]]:
    """Average True Range."""
    if len(closes) <= period:
        return [None] * len(closes)
        
    trs = [highs[0] - lows[0]]
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        trs.append(tr)
        
    atr: List[Optional[float]] = [None] * (period - 1)
    atr.append(sum(trs[:period]) / period)
    
    for i in range(period, len(trs)):
        prev_atr = atr[-1]
        if prev_atr is None: continue
        current_atr = (prev_atr * (period - 1) + trs[i]) / period
        atr.append(current_atr)
        
    return atr