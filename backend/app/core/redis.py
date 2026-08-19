"""Redis connection pool for real-time state and cache."""
from redis.asyncio import ConnectionPool, Redis

from app.core.config import settings

_pool = ConnectionPool.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> Redis:
    """Return a Redis client backed by the shared connection pool."""
    return Redis(connection_pool=_pool)
