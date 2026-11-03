"""
Simple rate limiting middleware using slowapi.
Protects endpoints from abuse without needing an external Redis server.
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.config import get_settings

_settings = get_settings()

# Initialize limiter
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{_settings.rate_limit_per_minute}/minute"],
)