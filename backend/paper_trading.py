"""Exact decimal arithmetic helpers for paper-trading calculations.

Database columns remain Float for backward compatibility in this first safe
upgrade. Convert to float only at the persistence/API boundary.
"""
from decimal import Decimal, InvalidOperation


def as_decimal(value: object, field_name: str) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{field_name} must be a valid number")
    if not number.is_finite() or number <= 0:
        raise ValueError(f"{field_name} must be a finite positive number")
    return number


def calculate_realized_pnl(side: str, entry_price: object, exit_price: object, quantity: object) -> Decimal:
    entry = as_decimal(entry_price, "entry_price")
    exit_ = as_decimal(exit_price, "exit_price")
    qty = as_decimal(quantity, "quantity")
    normalized_side = side.upper()
    if normalized_side == "BUY":
        return (exit_ - entry) * qty
    if normalized_side == "SELL":
        return (entry - exit_) * qty
    raise ValueError("side must be BUY or SELL")
