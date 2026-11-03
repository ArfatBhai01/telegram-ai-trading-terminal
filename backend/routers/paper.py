from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, PaperAccount, PaperTrade
from backend.schemas import PaperAccountOut, PaperTradeOut
from backend.auth.telegram import get_current_user

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])


def get_or_create_account(user: User, db: Session) -> PaperAccount:
    """Har user ka ek default account hoga (USDT). Agar nahi hai toh bana do."""
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
    """Returns the user's paper trading balance."""
    return get_or_create_account(current_user, db)


@router.post("/trade/open", response_model=PaperTradeOut)
def open_trade(
    symbol: str,
    side: str,  # BUY or SELL
    entry_price: float,
    quantity: float,
    stop_loss: float = None,
    take_profit: float = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Opens a new virtual trade."""
    if side.upper() not in ["BUY", "SELL"]:
        raise HTTPException(status_code=400, detail="Side must be BUY or SELL")
    
    account = get_or_create_account(current_user, db)
    
    # Simple check: Don't allow trade if balance is too low
    cost = entry_price * quantity
    if cost > account.balance:
        raise HTTPException(status_code=400, detail="Insufficient virtual balance.")

    trade = PaperTrade(
        account_id=account.id,
        symbol=symbol.upper(),
        market="crypto",
        side=side.upper(),
        entry_price=entry_price,
        quantity=quantity,
        stop_loss=stop_loss,
        take_profit=take_profit,
        status="OPEN"
    )
    
    # Deduct cost from balance
    account.balance -= cost
    
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


@router.post("/trade/close/{trade_id}", response_model=PaperTradeOut)
def close_trade(
    trade_id: int,
    exit_price: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Closes an open virtual trade and calculates PnL."""
    account = get_or_create_account(current_user, db)
    trade = db.query(PaperTrade).filter(PaperTrade.id == trade_id, PaperTrade.account_id == account.id).first()
    
    if not trade or trade.status == "CLOSED":
        raise HTTPException(status_code=404, detail="Open trade not found.")

    trade.exit_price = exit_price
    trade.status = "CLOSED"
    
    # PnL Calculation
    if trade.side == "BUY":
        pnl = (exit_price - trade.entry_price) * trade.quantity
    else: # SELL
        pnl = (trade.entry_price - exit_price) * trade.quantity
        
    trade.realized_pnl = pnl
    
    # Return cost + PnL to balance
    cost = trade.entry_price * trade.quantity
    account.balance += (cost + pnl)
    
    db.commit()
    db.refresh(trade)
    return trade


@router.get("/trades", response_model=List[PaperTradeOut])
def get_trades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all paper trades for the current user."""
    account = get_or_create_account(current_user, db)
    return db.query(PaperTrade).filter(PaperTrade.account_id == account.id).order_by(PaperTrade.opened_at.desc()).all()