"""Background task, started at app startup, that subscribes to every Redis
pub/sub channel the simulator publishes on and rebroadcasts each message to
that channel's connected WebSocket clients.
"""
import asyncio

from app.core.logging import get_logger
from app.core.redis import get_redis
from app.core.ws_channels import ALL_CHANNELS
from app.websockets.manager import manager

logger = get_logger(__name__)


async def relay_channel(channel: str) -> None:
    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)
    logger.info("redis_relay_subscribed", channel=channel)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            await manager.broadcast(channel, message["data"])
    finally:
        await pubsub.unsubscribe(channel)


async def start_relays() -> list[asyncio.Task]:
    tasks = []
    for channel in ALL_CHANNELS:
        task = asyncio.create_task(_relay_forever(channel))
        tasks.append(task)
    return tasks


async def _relay_forever(channel: str) -> None:
    while True:
        try:
            await relay_channel(channel)
        except Exception:
            logger.exception("redis_relay_error", channel=channel)
            await asyncio.sleep(2)
