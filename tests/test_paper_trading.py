from decimal import Decimal

import pytest

from backend.paper_trading import calculate_realized_pnl


@pytest.mark.parametrize(
    ("side", "entry", "exit_price", "quantity", "expected"),
    [
        ("BUY", "100", "110", "2", "20"),
        ("BUY", "100", "90", "2", "-20"),
        ("SELL", "100", "90", "2", "20"),
        ("SELL", "100", "110", "2", "-20"),
        ("BUY", "1.28", "1.30", "77.91", "1.5582"),
    ],
)
def test_realized_pnl(side, entry, exit_price, quantity, expected):
    assert calculate_realized_pnl(side, entry, exit_price, quantity) == Decimal(expected)


@pytest.mark.parametrize(
    ("entry", "exit_price", "quantity"),
    [("0", "10", "1"), ("10", "-1", "1"), ("10", "11", "0"), ("NaN", "11", "1")],
)
def test_rejects_invalid_numbers(entry, exit_price, quantity):
    with pytest.raises(ValueError):
        calculate_realized_pnl("BUY", entry, exit_price, quantity)
