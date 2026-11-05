from __future__ import annotations
from typing import List, Literal
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from backend.database import get_db
from backend.models import User, PaperAccount, PaperTrade
from backend.schemas import PaperAccountOut, PaperTradeOut
from backend.auth.telegram import get_current_user
from backend.paper_trading import as_decimal, calculate_realized_pnl

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])


class OpenTradeRequest(BaseModel):
    symbol: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9]{2,20}/[A-Za-z0-9]{2,20}$")
    side: Literal["BUY", "SELL"]
    entry_price: float = Field(gt=0, allow_inf_nan=False)
    quantity: float = Field(gt=0, allow_inf_nan=False)


class CloseTradeRequest(BaseModel):
    exit_price: float = Field(gt=0, allow_inf_nan=False)


def get_or_create_account(user: User, db: Session) -> PaperAccount:
    account = db.query(PaperAccount).filter(PaperAccount.user_id == user.id).first()
    if not account:
        account = PaperAccount(user_id=user.id, currency="USDT", balance=10000.0)
        db.add(account)
        db.commit()
        db.refresh(account)
    return account


@router.get("/account", response_model=PaperAccountOut)
def get_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_or_create_account(current_user, db)


@router.post("/trade/open", response_model=PaperTradeOut)
def open_trade(
    request: OpenTradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = get_or_create_account(current_user, db)

    try:
        cost = as_decimal(request.entry_price, "entry_price") * as_decimal(request.quantity, "quantity")
        balance = Decimal(str(account.balance))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if cost > balance:
        raise HTTPException(status_code=400, detail="Insufficient virtual balance.")

    trade = PaperTrade(
        account_id=account.id,
        symbol=request.symbol.upper(),
        market="crypto",
        side=request.side,
        entry_price=request.entry_price,
        quantity=request.quantity,
        status="OPEN",
    )

    account.balance = float(balance - cost)
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


@router.post("/trade/close/{trade_id}", response_model=PaperTradeOut)
def close_trade(
    trade_id: int,
    request: CloseTradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = get_or_create_account(current_user, db)
    trade = (
        db.query(PaperTrade)
        .filter(PaperTrade.id == trade_id, PaperTrade.account_id == account.id)
        .with_for_update()
        .first()
    )

    if not trade or trade.status != "OPEN":
        raise HTTPException(status_code=404, detail="Open trade not found.")

    try:
        pnl = calculate_realized_pnl(
            trade.side, trade.entry_price, request.exit_price, trade.quantity
        )
        reserved_cost = as_decimal(trade.entry_price, "entry_price") * as_decimal(trade.quantity, "quantity")
        balance = Decimal(str(account.balance))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    trade.exit_price = request.exit_price
    trade.status = "CLOSED"
    trade.closed_at = datetime.now(timezone.utc)
    trade.realized_pnl = float(pnl)

    # Return the reserved notional plus the realized profit/loss.
    account.balance = float(balance + reserved_cost + pnl)

    db.commit()
    db.refresh(trade)
    return trade


@router.get("/trades", response_model=List[PaperTradeOut])
def get_trades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = get_or_create_account(current_user, db)
    return (
        db.query(PaperTrade)
        .filter(PaperTrade.account_id == account.id)
        .order_by(PaperTrade.opened_at.desc())
        .all()
    )
