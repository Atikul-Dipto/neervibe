"""Import every model so Base.metadata is complete for Alembic autogenerate."""
from app.models.delivery import DeliveryAttempt, Route
from app.models.edge import LogisticsEdge
from app.models.event import PackageEvent, RouteEvent
from app.models.ml_prediction import MLPrediction
from app.models.node import LogisticsNode
from app.models.order import Order
from app.models.package import Package, PackageItem
from app.models.party import Customer, Merchant
from app.models.vehicle import Rider, Vehicle, VehicleLocation

__all__ = [
    "Customer",
    "Merchant",
    "LogisticsNode",
    "LogisticsEdge",
    "Order",
    "Package",
    "PackageItem",
    "Vehicle",
    "VehicleLocation",
    "Rider",
    "PackageEvent",
    "RouteEvent",
    "DeliveryAttempt",
    "Route",
    "MLPrediction",
]
