"""Tracks connected WebSocket clients per channel and broadcasts to them."""
from fastapi import WebSocket

from app.core.logging import LogEvent, get_logger

logger = get_logger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(channel, set()).add(websocket)
        logger.info(LogEvent.WEBSOCKET_CLIENT_CONNECTED, channel=channel)

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        self._connections.get(channel, set()).discard(websocket)
        logger.info(LogEvent.WEBSOCKET_CLIENT_DISCONNECTED, channel=channel)

    async def broadcast(self, channel: str, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections.get(channel, set()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(channel, ws)


manager = ConnectionManager()
