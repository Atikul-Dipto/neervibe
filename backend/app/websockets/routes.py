"""WebSocket endpoints. Each channel relays whatever the simulation engine
publishes to the matching Redis pub/sub channel — the backend never
generates this data itself, it's a pass-through so many browser tabs can
share one upstream subscription per channel.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.ws_channels import NETWORK, NODES, PACKAGES, ROUTES, VEHICLES
from app.websockets.manager import manager

router = APIRouter()


async def _handle(channel: str, websocket: WebSocket) -> None:
    await manager.connect(channel, websocket)
    try:
        while True:
            # Clients don't send anything meaningful; this just detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, websocket)


@router.websocket("/ws/live/network")
async def ws_network(websocket: WebSocket) -> None:
    await _handle(NETWORK, websocket)


@router.websocket("/ws/live/vehicles")
async def ws_vehicles(websocket: WebSocket) -> None:
    await _handle(VEHICLES, websocket)


@router.websocket("/ws/live/packages")
async def ws_packages(websocket: WebSocket) -> None:
    await _handle(PACKAGES, websocket)


@router.websocket("/ws/live/routes")
async def ws_routes(websocket: WebSocket) -> None:
    await _handle(ROUTES, websocket)


@router.websocket("/ws/live/nodes")
async def ws_nodes(websocket: WebSocket) -> None:
    await _handle(NODES, websocket)
