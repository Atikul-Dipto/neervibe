"""Shared test fixtures.

pytest-asyncio gives each async test function its own event loop by
default. The app's SQLAlchemy async engine (app.core.database.engine) is a
module-level singleton whose connection pool lazily opens asyncpg
connections bound to whatever loop is running at the time. Left alone,
connections opened during one test leak into the next test's (different,
and eventually closed) loop, and the pool's cleanup then crashes trying to
use a closed loop. Disposing the pool after every test forces fresh
connections per test, each cleaned up in the loop that opened them.
"""
import pytest_asyncio

from app.core.database import engine


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_pool_after_test():
    yield
    await engine.dispose()
