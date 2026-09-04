"""Give every in-flight package a physical location.

`scripts/generate_dummy_packages.py` used to create packages with a source
and a destination but no `current_node_id`, and the simulator only sets one
when a vehicle carrying that package arrives somewhere. The result: no
parcel was anywhere, so hub load, sorting queues, "current hub" and every
congestion metric read zero even though the network was busy.

This script places each non-terminal package at the node its status implies
(see app.services.placement for the rule), preferring real history: if an
event records the last node the parcel was scanned at, that wins. It then
refreshes `logistics_nodes.current_load`, which is the denormalised count of
non-terminal packages sitting at each node.

Idempotent and deterministic. Run from backend/ so app.core.config resolves
../.env:

    cd backend && ../venv/Scripts/python.exe ../scripts/backfill_package_locations.py
"""
import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.models.event import PackageEvent
from app.models.node import LogisticsNode
from app.models.package import Package
from app.services.placement import TERMINAL_STATUSES, NodeGraph, locate_package


async def backfill(session: AsyncSession) -> None:
    nodes = list((await session.execute(select(LogisticsNode))).scalars().all())
    graph = NodeGraph(nodes)
    packages = list((await session.execute(select(Package))).scalars().all())
    active = [p for p in packages if p.current_status not in TERMINAL_STATUSES]

    # Real history first: the last event that recorded a node.
    last_scanned: dict = {}
    events = (await session.execute(select(PackageEvent).order_by(PackageEvent.timestamp))).scalars().all()
    for e in events:
        if e.node_id is not None:
            last_scanned[e.package_id] = e.node_id

    placed: Counter = Counter()
    from_history = 0
    already = 0

    for p in active:
        if p.current_node_id is not None:
            already += 1
            continue

        scanned = last_scanned.get(p.id)
        if scanned in graph.by_id:
            p.current_node_id = scanned
            from_history += 1
            placed[graph.by_id[scanned].node_name] += 1
            continue

        source = graph.by_id.get(p.source_node_id)
        dest = graph.by_id.get(p.destination_node_id)
        if source is None or dest is None:
            continue

        target = locate_package(p.current_status, source, dest, graph)
        if target is None:
            continue
        p.current_node_id = target.id
        placed[target.node_name] += 1

    loads = Counter(
        p.current_node_id for p in packages if p.current_status not in TERMINAL_STATUSES and p.current_node_id
    )
    for n in nodes:
        n.current_load = loads.get(n.id, 0)

    print(f"active packages: {len(active)} · already located: {already} · from event history: {from_history}")
    print(f"newly placed: {sum(placed.values())}")
    print("busiest nodes now:")
    for name, count in placed.most_common(10):
        print(f"  {name}: {count}")
    print(f"nodes with load > 0: {sum(1 for n in nodes if n.current_load > 0)} of {len(nodes)}")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await backfill(session)
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
