import os
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models import Base

# Load .env before reading any environment variable — this file is imported
# first in the module graph (before routes_ai.py where load_dotenv() used to
# live), so dotenv must be bootstrapped here.
load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

_is_sqlite = DATABASE_URL.startswith("sqlite")

# aiosqlite runs the SQLite driver in a background thread; SQLite's default
# same-thread safety check must be disabled so async sessions can use the
# connection from the asyncio event-loop thread.
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_async_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    # pool_pre_ping keeps stale PostgreSQL connections from surfacing as errors;
    # it is a no-op for SQLite but harmless to leave enabled.
    pool_pre_ping=not _is_sqlite,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Create all tables on startup. No migration tooling required for dev."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a transactional session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
