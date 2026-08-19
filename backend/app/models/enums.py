"""Shared enumerations for the logistics domain model."""
import enum


class NodeType(str, enum.Enum):
    MERCHANT = "MERCHANT"
    PICKUP_POINT = "PICKUP_POINT"
    HUB = "HUB"
    SORTING_CENTER = "SORTING_CENTER"
    REGIONAL_HUB = "REGIONAL_HUB"
    DISTRIBUTION_CENTER = "DISTRIBUTION_CENTER"
    DELIVERY_HUB = "DELIVERY_HUB"
    CUSTOMER = "CUSTOMER"


class OperatingStatus(str, enum.Enum):
    OPERATIONAL = "OPERATIONAL"
    DEGRADED = "DEGRADED"
    CONGESTED = "CONGESTED"
    CLOSED = "CLOSED"
    MAINTENANCE = "MAINTENANCE"


class RoadType(str, enum.Enum):
    HIGHWAY = "HIGHWAY"
    ARTERIAL = "ARTERIAL"
    URBAN = "URBAN"
    RURAL = "RURAL"
    FERRY = "FERRY"


class RouteStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    CONGESTED = "CONGESTED"
    BLOCKED = "BLOCKED"
    SUSPENDED = "SUSPENDED"


class PackageStatus(str, enum.Enum):
    PACKAGE_CREATED = "PACKAGE_CREATED"
    PICKUP_ASSIGNED = "PICKUP_ASSIGNED"
    PICKED_UP = "PICKED_UP"
    ARRIVED_AT_HUB = "ARRIVED_AT_HUB"
    SORTING = "SORTING"
    DISPATCHED = "DISPATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    ARRIVED_AT_DESTINATION_HUB = "ARRIVED_AT_DESTINATION_HUB"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    RETURN_REQUESTED = "RETURN_REQUESTED"
    RETURN_IN_TRANSIT = "RETURN_IN_TRANSIT"
    RETURNED = "RETURNED"
    DELIVERY_FAILED = "DELIVERY_FAILED"
    RESCHEDULED = "RESCHEDULED"
    LOST = "LOST"
    DAMAGED = "DAMAGED"


# Explicit allowed forward/side transitions for the package state machine.
# Enforced in app.state_machine.package_state_machine — not just documentation.
PACKAGE_STATUS_TRANSITIONS: dict[PackageStatus, set[PackageStatus]] = {
    PackageStatus.PACKAGE_CREATED: {PackageStatus.PICKUP_ASSIGNED, PackageStatus.CANCELLED},
    PackageStatus.PICKUP_ASSIGNED: {PackageStatus.PICKED_UP, PackageStatus.CANCELLED},
    PackageStatus.PICKED_UP: {PackageStatus.ARRIVED_AT_HUB},
    PackageStatus.ARRIVED_AT_HUB: {PackageStatus.SORTING},
    PackageStatus.SORTING: {PackageStatus.DISPATCHED},
    PackageStatus.DISPATCHED: {PackageStatus.IN_TRANSIT},
    PackageStatus.IN_TRANSIT: {
        PackageStatus.ARRIVED_AT_HUB,
        PackageStatus.ARRIVED_AT_DESTINATION_HUB,
        PackageStatus.LOST,
        PackageStatus.DAMAGED,
    },
    PackageStatus.ARRIVED_AT_DESTINATION_HUB: {PackageStatus.OUT_FOR_DELIVERY},
    PackageStatus.OUT_FOR_DELIVERY: {
        PackageStatus.DELIVERED,
        PackageStatus.DELIVERY_FAILED,
    },
    PackageStatus.DELIVERY_FAILED: {
        PackageStatus.RESCHEDULED,
        PackageStatus.RETURN_REQUESTED,
    },
    PackageStatus.RESCHEDULED: {PackageStatus.OUT_FOR_DELIVERY},
    PackageStatus.RETURN_REQUESTED: {PackageStatus.RETURN_IN_TRANSIT},
    PackageStatus.RETURN_IN_TRANSIT: {PackageStatus.RETURNED},
    PackageStatus.DELIVERED: set(),
    PackageStatus.CANCELLED: set(),
    PackageStatus.RETURNED: set(),
    PackageStatus.LOST: set(),
    PackageStatus.DAMAGED: set(),
}


class PackageType(str, enum.Enum):
    DOCUMENT = "DOCUMENT"
    PARCEL = "PARCEL"
    FRAGILE = "FRAGILE"
    PERISHABLE = "PERISHABLE"
    BULK = "BULK"
    ELECTRONICS = "ELECTRONICS"


class PaymentType(str, enum.Enum):
    PREPAID = "PREPAID"
    COD = "COD"


class DeliveryType(str, enum.Enum):
    STANDARD = "STANDARD"
    EXPRESS = "EXPRESS"
    SAME_DAY = "SAME_DAY"
    SCHEDULED = "SCHEDULED"


class Priority(str, enum.Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"


class VehicleType(str, enum.Enum):
    BICYCLE = "BICYCLE"
    MOTORCYCLE = "MOTORCYCLE"
    VAN = "VAN"
    TRUCK = "TRUCK"
    MINI_TRUCK = "MINI_TRUCK"


class VehicleStatus(str, enum.Enum):
    IDLE = "IDLE"
    EN_ROUTE = "EN_ROUTE"
    LOADING = "LOADING"
    UNLOADING = "UNLOADING"
    MAINTENANCE = "MAINTENANCE"
    OFFLINE = "OFFLINE"


class RiderStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    ON_DELIVERY = "ON_DELIVERY"
    ON_PICKUP = "ON_PICKUP"
    OFF_DUTY = "OFF_DUTY"


class EventType(str, enum.Enum):
    PACKAGE_CREATED = "PACKAGE_CREATED"
    PACKAGE_STATUS_CHANGED = "PACKAGE_STATUS_CHANGED"
    VEHICLE_LOCATION_UPDATED = "VEHICLE_LOCATION_UPDATED"
    ROUTE_CONGESTION_UPDATED = "ROUTE_CONGESTION_UPDATED"
    ML_PREDICTION_GENERATED = "ML_PREDICTION_GENERATED"
    DELIVERY_ATTEMPTED = "DELIVERY_ATTEMPTED"


class DeliveryAttemptResult(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED_NO_RECIPIENT = "FAILED_NO_RECIPIENT"
    FAILED_ADDRESS_ISSUE = "FAILED_ADDRESS_ISSUE"
    FAILED_REFUSED = "FAILED_REFUSED"
    FAILED_OTHER = "FAILED_OTHER"
