"""
Telegram Mini App initData validation.
Ensures that the request is actually coming from Telegram, not a fake client.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qsl

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.models import User

_settings = get_settings()


def _verify_telegram_hash(init_data: str, bot_token: str) -> bool:
    """Validates the HMAC signature according to Telegram's official docs."""
    try:
        parsed_data = dict(parse_qsl(init_data, keep_blank_values=True))
    except ValueError:
        return False

    if "hash" not in parsed_data:
        return False

    received_hash = parsed_data.pop("hash")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed_data.items())
    )

    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()

    calculated_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(calculated_hash, received_hash)


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    """
    Dependency that extracts and verifies the Telegram user from the initData header.
    """
    init_data = request.headers.get("X-Telegram-Init-Data")
    
    # Fallback for local development if no bot token is set
    if not _settings.telegram_bot_token and _settings.app_env == "development":
        dummy_id = 123456789
        user = db.query(User).filter(User.telegram_id == dummy_id).first()
        if not user:
            user = User(telegram_id=dummy_id, first_name="DevUser", is_admin=True)
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    if not init_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Telegram-Init-Data header",
        )

    if not _verify_telegram_hash(init_data, _settings.telegram_bot_token or ""):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Telegram initData signature",
        )

    try:
        parsed = dict(parse_qsl(init_data))
        user_data = json.loads(parsed.get("user", "{}"))
        telegram_id = user_data.get("id")
        
        if not telegram_id:
            raise ValueError("No user ID in initData")

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed initData payload",
        )

    auth_date = int(parsed.get("auth_date", 0))
    now = int(datetime.now(timezone.utc).timestamp())
    if now - auth_date > 86400:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="initData has expired",
        )

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    is_admin = telegram_id in _settings.admin_telegram_ids_list

    if not user:
        user = User(
            telegram_id=telegram_id,
            username=user_data.get("username"),
            first_name=user_data.get("first_name"),
            language_code=user_data.get("language_code"),
            is_admin=is_admin,
        )
        db.add(user)
    else:
        user.username = user_data.get("username", user.username)
        user.last_seen_at = datetime.now(timezone.utc)
        user.is_admin = is_admin

    db.commit()
    db.refresh(user)
    return user