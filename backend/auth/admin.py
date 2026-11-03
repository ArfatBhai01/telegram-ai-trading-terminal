"""
Admin Guard dependency.
Only allows users whose Telegram ID is in the ADMIN_TELEGRAM_IDS env var.
"""
from fastapi import Depends, HTTPException, status

from backend.auth.telegram import get_current_user
from backend.models import User


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that raises 403 if the user is not an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user