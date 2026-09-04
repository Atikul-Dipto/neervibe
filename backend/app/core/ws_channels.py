"""Redis pub/sub channel names. Must stay identical to simulator/redis_channels.py
— the simulator publishes on these, the API gateway relays them to WebSocket
clients. Duplicated (rather than imported across the backend/simulator
boundary) so each service stays independently deployable per the
architecture's modularity rule.
"""
NETWORK = "live:network"
VEHICLES = "live:vehicles"
RIDERS = "live:riders"
PACKAGES = "live:packages"
ROUTES = "live:routes"
NODES = "live:nodes"

ALL_CHANNELS = [NETWORK, VEHICLES, RIDERS, PACKAGES, ROUTES, NODES]
