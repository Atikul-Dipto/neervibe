"""Aggregation queries backing the /analytics endpoint.

Kept as one module of straightforward read-only SQL rather than spread
across ORM query-builder calls — these are reporting aggregates, not
domain writes, so raw SQL is more readable than the equivalent chained
SQLAlchemy Core expressions. No user input is interpolated into any query.
"""
from datetime import datetime, timezone

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.analytics import (
    AnalyticsOverview,
    HubVolume,
    NetworkMetrics,
    NetworkOverview,
    OperationalMetrics,
)

IN_TRANSIT_STATUSES = (
    "PICKED_UP",
    "ARRIVED_AT_HUB",
    "SORTING",
    "DISPATCHED",
    "IN_TRANSIT",
    "ARRIVED_AT_DESTINATION_HUB",
    "OUT_FOR_DELIVERY",
)
OPEN_STATUSES = IN_TRANSIT_STATUSES + ("PACKAGE_CREATED", "PICKUP_ASSIGNED", "RESCHEDULED")
RETURN_STATUSES = ("RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURNED")
TERMINAL_STATUSES = ("DELIVERED", "CANCELLED", "RETURNED", "LOST", "DAMAGED")

# LogisticsNode.current_load is never actually incremented/decremented
# anywhere in the app (nodes are created with 0 and nothing updates it), so
# it can't be trusted for utilization/volume metrics. Compute a real live
# load instead: how many non-terminal packages currently sit at each node.
NODE_LOAD_CTE = """
    WITH node_loads AS (
        SELECT current_node_id AS node_id, count(*) AS load
        FROM packages
        WHERE current_node_id IS NOT NULL AND current_status NOT IN :terminal_statuses
        GROUP BY current_node_id
    )
"""

CONGESTION_THRESHOLD = 0.6
RISK_THRESHOLD = 0.5


async def get_network_overview(db: AsyncSession) -> NetworkOverview:
    row = (
        await db.execute(
            text(
                """
                SELECT
                    count(*) AS total_packages,
                    count(*) FILTER (WHERE current_status IN :in_transit) AS in_transit,
                    count(*) FILTER (WHERE current_status = 'DELIVERED') AS delivered,
                    count(*) FILTER (
                        WHERE current_status IN :open_statuses AND expected_delivery_at < now()
                    ) AS delayed,
                    count(*) FILTER (WHERE current_status = 'DELIVERY_FAILED') AS failed_deliveries,
                    count(*) FILTER (WHERE current_status IN :return_statuses) AS returns
                FROM packages
                """
            ).bindparams(
                bindparam("in_transit", expanding=True),
                bindparam("open_statuses", expanding=True),
                bindparam("return_statuses", expanding=True),
            ),
            {
                "in_transit": tuple(IN_TRANSIT_STATUSES),
                "open_statuses": tuple(OPEN_STATUSES),
                "return_statuses": tuple(RETURN_STATUSES),
            },
        )
    ).one()

    vehicles_row = (
        await db.execute(
            text("SELECT count(*) FILTER (WHERE status != 'OFFLINE') AS active_vehicles FROM vehicles")
        )
    ).one()
    riders_row = (
        await db.execute(
            text("SELECT count(*) FILTER (WHERE status != 'OFF_DUTY') AS active_riders FROM riders")
        )
    ).one()
    routes_row = (
        await db.execute(
            text("SELECT count(*) FILTER (WHERE route_status = 'ACTIVE') AS active_routes FROM logistics_edges")
        )
    ).one()
    utilization_row = (
        await db.execute(
            text(
                NODE_LOAD_CTE
                + """
                SELECT coalesce(avg(coalesce(nl.load, 0)::float / nullif(n.capacity, 0)) * 100, 0) AS utilization_pct
                FROM logistics_nodes n
                LEFT JOIN node_loads nl ON nl.node_id = n.id
                WHERE n.capacity > 0
                """
            ).bindparams(bindparam("terminal_statuses", expanding=True)),
            {"terminal_statuses": tuple(TERMINAL_STATUSES)},
        )
    ).one()

    return NetworkOverview(
        total_packages=row.total_packages,
        in_transit=row.in_transit,
        delivered=row.delivered,
        delayed=row.delayed,
        failed_deliveries=row.failed_deliveries,
        returns=row.returns,
        active_vehicles=vehicles_row.active_vehicles,
        active_riders=riders_row.active_riders,
        active_routes=routes_row.active_routes,
        network_utilization_pct=round(utilization_row.utilization_pct, 1),
    )


async def get_operational_metrics(db: AsyncSession) -> OperationalMetrics:
    delivery_time_row = (
        await db.execute(
            text(
                """
                SELECT
                    avg(extract(epoch FROM (actual_delivery_at - created_at)) / 60) AS avg_delivery_minutes,
                    count(*) FILTER (WHERE actual_delivery_at <= expected_delivery_at) AS on_time,
                    count(*) AS delivered_count
                FROM packages
                WHERE current_status = 'DELIVERED' AND actual_delivery_at IS NOT NULL
                """
            )
        )
    ).one()

    pickup_time_row = (
        await db.execute(
            text(
                """
                SELECT avg(extract(epoch FROM (e.timestamp - p.created_at)) / 60) AS avg_pickup_minutes
                FROM package_events e
                JOIN packages p ON p.id = e.package_id
                WHERE e.new_status = 'PICKED_UP'
                """
            )
        )
    ).one()

    hub_processing_row = (
        await db.execute(
            text(
                """
                WITH ordered AS (
                    SELECT
                        package_id,
                        new_status,
                        timestamp,
                        LAG(new_status) OVER (PARTITION BY package_id ORDER BY timestamp) AS prev_status,
                        LAG(timestamp) OVER (PARTITION BY package_id ORDER BY timestamp) AS prev_timestamp
                    FROM package_events
                )
                SELECT avg(extract(epoch FROM (timestamp - prev_timestamp)) / 60) AS avg_hub_minutes
                FROM ordered
                WHERE new_status = 'DISPATCHED' AND prev_status = 'ARRIVED_AT_HUB'
                """
            )
        )
    ).one()

    attempts_row = (
        await db.execute(
            text(
                """
                SELECT
                    count(*) FILTER (WHERE attempt_number = 1 AND result = 'SUCCESS') AS first_attempt_success,
                    count(*) FILTER (WHERE attempt_number = 1) AS first_attempts
                FROM delivery_attempts
                """
            )
        )
    ).one()

    totals_row = (
        await db.execute(
            text(
                """
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE current_status IN :return_statuses) AS returns,
                    count(*) FILTER (WHERE current_status = 'CANCELLED') AS cancelled
                FROM packages
                """
            ).bindparams(bindparam("return_statuses", expanding=True)),
            {"return_statuses": tuple(RETURN_STATUSES)},
        )
    ).one()

    on_time_pct = (
        round(delivery_time_row.on_time / delivery_time_row.delivered_count * 100, 1)
        if delivery_time_row.delivered_count
        else None
    )
    first_attempt_pct = (
        round(attempts_row.first_attempt_success / attempts_row.first_attempts * 100, 1)
        if attempts_row.first_attempts
        else None
    )

    return OperationalMetrics(
        avg_delivery_time_minutes=_round_or_none(delivery_time_row.avg_delivery_minutes),
        avg_pickup_time_minutes=_round_or_none(pickup_time_row.avg_pickup_minutes),
        hub_processing_time_minutes=_round_or_none(hub_processing_row.avg_hub_minutes),
        first_attempt_delivery_rate_pct=first_attempt_pct,
        on_time_delivery_rate_pct=on_time_pct,
        sla_breach_rate_pct=round(100 - on_time_pct, 1) if on_time_pct is not None else None,
        return_rate_pct=round(totals_row.returns / totals_row.total * 100, 1) if totals_row.total else 0.0,
        cancellation_rate_pct=round(totals_row.cancelled / totals_row.total * 100, 1) if totals_row.total else 0.0,
    )


async def get_network_metrics(db: AsyncSession) -> NetworkMetrics:
    nodes_row = (
        await db.execute(
            text("SELECT count(*) FILTER (WHERE operating_status = 'OPERATIONAL') AS active_nodes FROM logistics_nodes")
        )
    ).one()

    edges_row = (
        await db.execute(
            text(
                """
                SELECT
                    count(*) FILTER (WHERE congestion_level > :congestion_threshold) AS congested_routes,
                    count(*) FILTER (WHERE risk_score > :risk_threshold) AS high_risk_routes
                FROM logistics_edges
                """
            ),
            {"congestion_threshold": CONGESTION_THRESHOLD, "risk_threshold": RISK_THRESHOLD},
        )
    ).one()

    top_hubs = (
        await db.execute(
            text(
                NODE_LOAD_CTE
                + """
                SELECT n.id, n.node_code, n.node_name, coalesce(nl.load, 0) AS current_load, n.capacity
                FROM logistics_nodes n
                LEFT JOIN node_loads nl ON nl.node_id = n.id
                WHERE n.node_type IN ('HUB', 'REGIONAL_HUB', 'DISTRIBUTION_CENTER', 'SORTING_CENTER', 'DELIVERY_HUB')
                ORDER BY current_load DESC
                LIMIT 5
                """
            ).bindparams(bindparam("terminal_statuses", expanding=True)),
            {"terminal_statuses": tuple(TERMINAL_STATUSES)},
        )
    ).all()

    throughput_row = (
        await db.execute(
            text(
                """
                SELECT count(*) AS delivered_24h
                FROM packages
                WHERE current_status = 'DELIVERED' AND actual_delivery_at >= now() - interval '24 hours'
                """
            )
        )
    ).one()

    return NetworkMetrics(
        active_nodes=nodes_row.active_nodes,
        congested_routes=edges_row.congested_routes,
        high_risk_routes=edges_row.high_risk_routes,
        highest_volume_hubs=[
            HubVolume(
                node_id=h.id,
                node_code=h.node_code,
                node_name=h.node_name,
                current_load=h.current_load,
                capacity=h.capacity,
            )
            for h in top_hubs
        ],
        network_throughput_24h=throughput_row.delivered_24h,
    )


async def get_analytics_overview(db: AsyncSession) -> AnalyticsOverview:
    network = await get_network_overview(db)
    operations = await get_operational_metrics(db)
    network_metrics = await get_network_metrics(db)
    return AnalyticsOverview(
        network=network,
        operations=operations,
        network_metrics=network_metrics,
        generated_at=datetime.now(timezone.utc),
    )


def _round_or_none(value: float | None) -> float | None:
    return round(value, 1) if value is not None else None
