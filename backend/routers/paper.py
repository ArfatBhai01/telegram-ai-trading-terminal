from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from backend.database import get_db
from backend.models import User, PaperAccount, PaperTrade
from backend.schemas import PaperAccountOut, PaperTradeOut
from backend.auth.telegram import get_current_user

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])

# --- Request Body Schemas ---
class OpenTradeRequest(BaseModel):
    symbol: str
    side: str  # BUY or SELL
    entry_price: float
    quantity: float

class CloseTradeRequest(BaseModel):
    exit_price: float


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
    if request.side.upper() not in ["BUY", "SELL"]:
        raise HTTPException(status_code=400, detail="Side must be BUY or SELL")
    
    account = get_or_create_account(current_user, db)
    
    # Cost calculate karein
    cost = request.entry_price * request.quantity
    
    if cost > account.balance:
        raise HTTPException(status_code=400, detail="Insufficient virtual balance.")

    # Trade save karein
    trade = PaperTrade(
        account_id=account.id,
        symbol=request.symbol.upper(),
        market="crypto",
        side=request.side.upper(),
        entry_price=request.entry_price,
        quantity=request.quantity,
        status="OPEN"
    )
    
    # Balance deduct karein
    account.balance -= cost
    
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
    trade = db.query(PaperTrade).filter(PaperTrade.id == trade_id, PaperTrade.account_id == account.id).first()
    
    if not trade or trade.status == "CLOSED":
        raise HTTPException(status_code=404, detail="Open trade not found.")

    trade.exit_price = request.exit_price
    trade.status = "CLOSED"
    trade.closed_at = datetime.now(timezone.utc)
    
    # PnL Calculation
    if trade.side == "BUY":
        pnl = (request.exit_price - trade.entry_price) * trade.quantity
    else: # SELL
        pnl = (trade.entry_price - request.exit_price) * trade.quantity
        
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
    account = get_or_create_account(current_user, db)
    return db.query(PaperTrade).filter(PaperTrade.account_id == account.id).order_by(PaperTrade.opened_at.desc()).all()