"""Redis pub/sub channel names shared between the simulator and the FastAPI
WebSocket layer. Kept as a single source of truth so producer and consumer
never drift.
"""
NETWORK = "live:network"
VEHICLES = "live:vehicles"
RIDERS = "live:riders"
PACKAGES = "live:packages"
ROUTES = "live:routes"
NODES = "live:nodes"
