"""
Strategy V1: Trend Following with Momentum.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional
from backend.market_data.types import Candle
from backend.engine.indicators import calculate_ema, calculate_rsi, calculate_atr

@dataclass
class StrategyResult:
    action: str  # BUY, SELL, WAIT, NO_TRADE
    reasons: List[str]
    invalidation: List[str]
    indicators: dict
    entry_zone: Optional[List[float]] = None
    stop_loss: Optional[float] = None
    take_profits: Optional[List[float]] = None

class StrategyV1:
    def __init__(self):
        self.version = "1.0.0"

    def analyze(self, candles: List[Candle]) -> StrategyResult:
        reasons = []
        invalidation = []
        
        # Minimum data requirement
        if len(candles) < 200:
            return StrategyResult(
                action="NO_TRADE",
                reasons=["Not enough candle data to calculate EMA 200."],
                invalidation=["Wait for more data."],
                indicators={}
            )

        closes = [c.close for c in candles]
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]
        
        # Calculate Indicators
        ema9 = calculate_ema(closes, 9)
        ema21 = calculate_ema(closes, 21)
        ema50 = calculate_ema(closes, 50)
        ema200 = calculate_ema(closes, 200)
        rsi14 = calculate_rsi(closes, 14)
        atr14 = calculate_atr(highs, lows, closes, 14)
        
        current_close = closes[-1]
        current_ema9 = ema9[-1]
        current_ema21 = ema21[-1]
        current_ema50 = ema50[-1]
        current_ema200 = ema200[-1]
        current_rsi = rsi14[-1]
        current_atr = atr14[-1]
        
        if any(x is None for x in [current_ema9, current_ema21, current_ema50, current_ema200, current_rsi, current_atr]):
             return StrategyResult(
                action="NO_TRADE",
                reasons=["Indicator calculation failed due to None values."],
                invalidation=["Wait for data."],
                indicators={}
            )

        indicators = {
            "ema9": current_ema9, "ema21": current_ema21, "ema50": current_ema50, "ema200": current_ema200,
            "rsi14": current_rsi, "atr14": current_atr
        }

        # --- LOGIC ---
        # Uptrend: EMA9 > EMA21 > EMA50 > EMA200
        is_uptrend = current_ema9 > current_ema21 > current_ema50 > current_ema200
        
        # Downtrend: EMA9 < EMA21 < EMA50 < EMA200
        is_downtrend = current_ema9 < current_ema21 < current_ema50 < current_ema200

        if is_uptrend:
            reasons.append("Strong bullish EMA alignment (9 > 21 > 50 > 200).")
            if current_rsi > 70:
                reasons.append(f"RSI is overbought ({current_rsi:.1f}).")
                return StrategyResult(
                    action="WAIT", reasons=reasons, invalidation=["Wait for RSI to cool down."], indicators=indicators
                )
            elif current_rsi > 50:
                reasons.append(f"RSI is bullish ({current_rsi:.1f}).")
                return StrategyResult(
                    action="BUY",
                    reasons=reasons,
                    invalidation=["Close below EMA 21.", "RSI falls below 40."],
                    indicators=indicators,
                    entry_zone=[current_close * 0.99, current_close],
                    stop_loss=current_close - (1.5 * current_atr),
                    take_profits=[current_close + (2.0 * current_atr), current_close + (4.0 * current_atr)]
                )
            else:
                reasons.append(f"RSI is weak ({current_rsi:.1f}), trend may be losing momentum.")
                return StrategyResult(action="WAIT", reasons=reasons, invalidation=["Wait for RSI strength."], indicators=indicators)

        elif is_downtrend:
            reasons.append("Strong bearish EMA alignment (9 < 21 < 50 < 200).")
            if current_rsi < 30:
                reasons.append(f"RSI is oversold ({current_rsi:.1f}).")
                return StrategyResult(
                    action="WAIT", reasons=reasons, invalidation=["Wait for RSI to rise."], indicators=indicators
                )
            elif current_rsi < 50:
                reasons.append(f"RSI is bearish ({current_rsi:.1f}).")
                return StrategyResult(
                    action="SELL",
                    reasons=reasons,
                    invalidation=["Close above EMA 21.", "RSI rises above 60."],
                    indicators=indicators,
                    entry_zone=[current_close, current_close * 1.01],
                    stop_loss=current_close + (1.5 * current_atr),
                    take_profits=[current_close - (2.0 * current_atr), current_close - (4.0 * current_atr)]
                )
            else:
                reasons.append(f"RSI is neutral ({current_rsi:.1f}), downtrend losing steam.")
                return StrategyResult(action="WAIT", reasons=reasons, invalidation=["Wait for RSI weakness."], indicators=indicators)

        else:
            reasons.append("Market is choppy. No clear trend alignment.")
            return StrategyResult(
                action="WAIT",
                reasons=reasons,
                invalidation=["Wait for EMAs to align in a clear trend."],
                indicators=indicators
            )