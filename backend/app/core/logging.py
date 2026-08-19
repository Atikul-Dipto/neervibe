"""Structured logging configuration (JSON in production, console in dev)."""
import logging
import sys

import structlog

from app.core.config import settings


def configure_logging() -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=settings.log_level,
    )

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    renderer = (
        structlog.processors.JSONRenderer()
        if settings.log_format == "json"
        else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.BoundLogger:
    return structlog.get_logger(name)


# Canonical event names used across the platform (see architecture spec, section 29).
class LogEvent:
    PACKAGE_CREATED = "PACKAGE_CREATED"
    PACKAGE_STATUS_CHANGED = "PACKAGE_STATUS_CHANGED"
    VEHICLE_LOCATION_UPDATED = "VEHICLE_LOCATION_UPDATED"
    ROUTE_CONGESTION_UPDATED = "ROUTE_CONGESTION_UPDATED"
    ML_PREDICTION_GENERATED = "ML_PREDICTION_GENERATED"
    WEBSOCKET_CLIENT_CONNECTED = "WEBSOCKET_CLIENT_CONNECTED"
    WEBSOCKET_CLIENT_DISCONNECTED = "WEBSOCKET_CLIENT_DISCONNECTED"
