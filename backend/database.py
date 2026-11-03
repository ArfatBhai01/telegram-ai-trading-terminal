"""
SQLAlchemy database setup.
"""
from __future__ import annotations
from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from backend.config import get_settings

class Base(DeclarativeBase):
    pass

_settings = get_settings()
_database_url = _settings.database_url
_connect_args = {"check_same_thread": False} if _settings.is_sqlite else {}

engine: Engine = create_engine(
    _database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    future=True,
)

if not _settings.is_sqlite and "sslmode=" not in _database_url:
    @event.listens_for(engine, "connect")
    def _force_ssl(dbapi_conn, _):
        try:
            dbapi_conn.set_session(autocommit=False)
        except Exception:
            pass

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db() -> None:
    from backend import models  # noqa: F401
    Base.metadata.create_all(bind=engine)