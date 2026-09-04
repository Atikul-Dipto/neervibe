"""Where a parcel physically is, given its status and its route.

A package always occupies space somewhere in the network, and hub load,
sorting queues and congestion metrics are all counts of parcels at a node.
This module is the single definition of that placement, shared by the
package generator, the location backfill and anything else that needs to
put a parcel on the map without a scan event to go on.
"""
from app.models.enums import NodeType, PackageStatus
from app.models.node import LogisticsNode

TERMINAL_STATUSES = (
    PackageStatus.DELIVERED,
    PackageStatus.CANCELLED,
    PackageStatus.RETURNED,
    PackageStatus.LOST,
    PackageStatus.DAMAGED,
)

_AT_SOURCE = {PackageStatus.PACKAGE_CREATED, PackageStatus.PICKUP_ASSIGNED}
_AT_ORIGIN_HUB = {PackageStatus.PICKED_UP, PackageStatus.ARRIVED_AT_HUB, PackageStatus.SORTING}
_IN_TRANSIT = {PackageStatus.DISPATCHED, PackageStatus.IN_TRANSIT}


class NodeGraph:
    """Index of the network by id, city and type."""

    def __init__(self, nodes: list[LogisticsNode]) -> None:
        self.by_id = {n.id: n for n in nodes}
        self.by_city: dict[str, list[LogisticsNode]] = {}
        for n in nodes:
            self.by_city.setdefault(n.city, []).append(n)
        self.distribution_center = next(
            (n for n in nodes if n.node_type == NodeType.DISTRIBUTION_CENTER), None
        )

    def pick(self, city: str, *types: NodeType) -> LogisticsNode | None:
        for node_type in types:
            for node in self.by_city.get(city, []):
                if node.node_type == node_type:
                    return node
        return None

    def origin_hub(self, city: str) -> LogisticsNode | None:
        return self.pick(
            city, NodeType.HUB, NodeType.SORTING_CENTER, NodeType.REGIONAL_HUB, NodeType.DELIVERY_HUB
        )

    def delivery_hub(self, city: str) -> LogisticsNode | None:
        return self.pick(city, NodeType.DELIVERY_HUB, NodeType.HUB, NodeType.REGIONAL_HUB)

    def transit_hub(self, source_city: str, dest_city: str) -> LogisticsNode | None:
        """Long hauls stage through a regional hub or the national centre;
        same-city moves stay on the local hub."""
        if source_city == dest_city:
            return self.origin_hub(source_city)
        return (
            self.pick(source_city, NodeType.REGIONAL_HUB, NodeType.SORTING_CENTER)
            or self.distribution_center
            or self.origin_hub(source_city)
        )


def locate_package(
    status: PackageStatus | str,
    source: LogisticsNode,
    destination: LogisticsNode,
    graph: NodeGraph,
) -> LogisticsNode | None:
    """The node a parcel in `status` should be sitting at.

        created / pickup assigned      -> the source node (the merchant)
        picked up / at hub / sorting   -> the source city's local hub
        dispatched / in transit        -> the regional hub or national centre
                                          it stages through
        at destination hub, out for
        delivery, failed, returns      -> the destination city's delivery hub

    Terminal statuses return None: a delivered or cancelled parcel occupies
    no capacity anywhere.
    """
    value = PackageStatus(status) if not isinstance(status, PackageStatus) else status
    if value in TERMINAL_STATUSES:
        return None
    if value in _AT_SOURCE:
        return source
    if value in _AT_ORIGIN_HUB:
        return graph.origin_hub(source.city) or source
    if value in _IN_TRANSIT:
        return graph.transit_hub(source.city, destination.city) or source
    return graph.delivery_hub(destination.city) or destination
