"""FastAPI application entrypoint — Logistics Control Tower API Gateway."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.websockets.redis_relay import start_relays
from app.websockets.routes import router as websocket_router

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("application_startup", env=settings.app_env)
    relay_tasks = await start_relays()
    yield
    for task in relay_tasks:
        task.cancel()
    logger.info("application_shutdown")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(websocket_router)


@app.get("/")
async def root() -> dict:
    return {"service": settings.app_name, "status": "online"}
