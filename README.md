# NeerVibe

A real-time logistics management and network visualization platform (the
"Logistics Control Tower"), built on synthetic Bangladesh logistics data
with a production-ready architecture so real data can be connected later.

## What's implemented right now

This is a phased build (see "Development phases" below). What's real and
tested today:

- **Domain model** — 15 tables (packages, logistics nodes/edges, vehicles,
  riders, customers, merchants, orders, immutable event log, ML predictions,
  routes, delivery attempts) as SQLAlchemy 2.0 async models with PostGIS
  geography columns, in [backend/app/models/](backend/app/models/).
- **Package lifecycle state machine** — the single source of truth for legal
  status transitions, in
  [backend/app/state_machine/package_state_machine.py](backend/app/state_machine/package_state_machine.py).
- **FastAPI gateway** — full CRUD-where-it-matters across
  nodes/packages/orders/vehicles/riders, plus read-only routes/events/
  tracking and the ML ETA endpoint. All backed by real DB queries (no mocked
  responses). A `services/` layer (`app/services/`) owns the business logic
  — package status changes go through `package_service.transition_status`,
  which enforces the state machine and writes the matching immutable event;
  endpoints never touch the state machine or write events directly.
  WebSocket endpoints (`/ws/live/*`) relay whatever the simulator publishes
  to Redis.
- **Bangladesh network seed script** — builds a realistic hub-and-spoke
  graph across 10 cities (Dhaka, Gazipur, Narayanganj, Chattogram, Cumilla,
  Sylhet, Rajshahi, Khulna, Rangpur, Mymensingh).
- **Synthetic data generators** — scalable package/order/event generation
  (`--count` from 100 to 100,000+).
- **Simulation engine** — moves vehicles along network edges, advances
  packages through the state machine, perturbs congestion, and publishes
  live updates to Redis.
- **ETA prediction model** — a trained TensorFlow/Keras regressor served via
  `POST /api/v1/ml/eta/predict`, decoupled from the operational database per
  the architecture rules.
- **Tests** — 18 tests covering the state machine, ETA feature pipeline, app
  boot/health, the trained ML endpoint, and (against the live database) the
  full order → package → status-transition lifecycle including the 409
  rejection of an illegal transition, vehicle/rider write endpoints, and
  routes listing. All passing (`pytest`).
- **Full stack verified against real infrastructure** — Docker Desktop,
  PostGIS, and Redis are running; the Alembic migration applies cleanly, the
  Bangladesh network seeds (105 nodes / 40 edges), 500 packages + ~3,800
  events generate correctly, the API serves real DB-backed responses, and
  the simulator's vehicle updates flow Postgres → Redis → WebSocket relay to
  a connected client, confirmed live.
- **Frontend control tower** (`frontend/`) — Next.js 16 + TypeScript +
  MapLibre GL, all seven nav pages built and wired to real data:
  - **Network** — the live map: seeded nodes/edges, animated vehicle
    positions over `/ws/live/vehicles`, click-a-node-for-detail,
    tracking-number search with a timeline view.
  - **Operations** — timing and delivery-performance KPIs (avg delivery/
    pickup time, on-time rate, SLA breach rate, return/cancellation rate).
  - **Packages** / **Vehicles** / **Hubs** — filterable, sortable tables
    over the real REST endpoints; clicking a row opens that item's detail
    in the right panel.
  - **Analytics** — network overview + network metrics + a highest-volume
    hubs table.
  - **AI Intelligence** — a live form driving `POST /api/v1/ml/eta/predict`
    against the trained model.

  A `LiveDataProvider` (always mounted at the page root) owns the
  vehicles/packages WebSocket subscriptions and writes into a shared
  zustand store, so the bottom live event stream keeps updating no matter
  which page is showing — it doesn't depend on the map being mounted.
  Verified end-to-end with real screenshots across every page: zero
  console errors, live vehicle movement, and the event stream populating
  from genuine simulator-driven package transitions.
- **Analytics backend** (`GET /api/v1/analytics/overview`) — real SQL
  aggregates (not mocked) computing network overview, operational metrics,
  and network metrics including a live per-node package count (the
  `current_load` column existed but was never actually maintained anywhere
  in the app, so it was fixed to compute from real package positions
  instead of always reading 0).

## What's NOT built yet

- Auth/RBAC enforcement (architecture is auth-ready; not wired up yet).
- Frontend automated tests (no Jest/Playwright suite yet).

## Architecture

```
Browser (future Next.js UI)
        │
   WebSocket / REST
        │
    FastAPI (backend/)
        │
   ┌────┼─────────────┐
   │    │             │
PostgreSQL  Redis   Simulator (simulator/)
+ PostGIS  (cache,        │
           pub/sub)  publishes vehicle/package
                     events to Redis channels
                          │
                    TensorFlow/Keras (ml/)
                    ETA prediction, called
                    from the API layer only —
                    never stores operational data
```

- **PostgreSQL + PostGIS**: source of truth for packages, network, events.
- **Redis**: real-time cache/pub-sub; the simulator publishes, FastAPI
  relays to WebSocket clients.
- **Event simulator**: `simulator/engine.py` — a standalone process, designed
  so it can later be swapped for Kafka/Redpanda without touching the API.
- **ML layer**: `ml/` — fully separate from `backend/`. The API calls into
  `ml.inference.eta_predictor`; the ML code never touches the operational
  database directly.

## Project layout

```
logistics-control-tower/
├── backend/        FastAPI app, ORM models, state machine, WebSockets
│   ├── app/
│   └── alembic/    DB migrations
├── ml/             TensorFlow/Keras ETA model — data, preprocessing,
│                   models, training, inference, evaluation, pipelines
├── simulator/       Real-time event simulation engine
├── frontend/        Next.js control tower UI
│   └── src/
│       ├── app/            routes (App Router)
│       ├── components/     map/, layout/, packages/
│       ├── hooks/          useLiveChannel (WebSocket)
│       ├── services/       REST API client
│       ├── store/          zustand global state
│       └── types/          domain types mirroring backend schemas
├── scripts/         Seed/data-generation scripts
├── tests/           unit / integration / simulation
├── docker-compose.yml
└── requirements.txt
```

## Installation

### 1. Virtual environment

```bash
py -3.13 -m venv venv          # Python 3.11+ required; see note below
venv\Scripts\activate           # Windows
pip install -r requirements.txt
```

> **Python version note**: the pinned `requirements.txt` versions
> (numpy 2.2.x, pandas 2.3.x, tensorflow 2.21, keras ≥3.12) were chosen
> because this environment runs Python 3.13, which has no wheels for the
> originally-planned tensorflow 2.18 / numpy 1.26 / pandas 2.2 lines. If you
> use Python 3.11 or 3.12 instead, you can pin back to those older,
> longer-established versions if you prefer.

### 2. PostgreSQL + PostGIS and Redis

Easiest path — Docker:

```bash
cp .env.example .env     # edit POSTGRES_PASSWORD, SECRET_KEY, etc.
docker compose up postgres redis
```

Without Docker, install PostgreSQL 16 with the PostGIS extension and Redis
locally, then update `DATABASE_URL` / `DATABASE_URL_SYNC` / `REDIS_URL` in
`.env` to match.

The database needs the PostGIS extension enabled once:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 3. Database migration

```bash
cd backend
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

### 4. Seed the Bangladesh logistics network

```bash
python scripts/seed_database.py
```

### 5. Generate synthetic packages + event history

```bash
python scripts/generate_dummy_packages.py --count 1000
python scripts/generate_dummy_events.py
```

Scale up to 10,000 or 100,000 by changing `--count` — the generators commit
in batches so this stays memory-safe.

### 6. Train the ETA model

```bash
python -m ml.training.train_eta_model
```

Trains on synthetic data (~20k samples in seconds on CPU) and saves the
artifact to `ml/models/artifacts/eta_predictor_v1/`.

### 7. Start the simulator

```bash
python -m simulator.engine
```

Ticks every `SIMULATION_TICK_SECONDS` (default 3s), moving vehicles and
advancing packages, publishing to Redis.

### 8. Start the API

```bash
cd backend
uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs` for interactive API docs.

### 9. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`. It talks to the backend at
`http://localhost:8000` by default — override with `NEXT_PUBLIC_API_BASE_URL`
/ `NEXT_PUBLIC_WS_BASE_URL` env vars if your backend runs elsewhere. The
backend's default CORS origin (`http://localhost:3000`) already matches
Next's dev port.

### 10. Run tests

```bash
pytest
```

`tests/unit` and `tests/simulation` need no infrastructure. `tests/integration`
boots the real FastAPI app; `/health/ready` reports `"degraded"` gracefully
if Postgres/Redis aren't reachable rather than failing the test suite.

## WebSocket architecture

| Channel | Redis pub/sub topic | Publishes |
|---|---|---|
| `/ws/live/vehicles` | `live:vehicles` | position, speed, heading per tick |
| `/ws/live/packages` | `live:packages` | status transitions |
| `/ws/live/routes` | `live:routes` | congestion/risk updates per edge |
| `/ws/live/nodes` | `live:nodes` | (reserved — Phase 3 hub load updates) |
| `/ws/live/network` | `live:network` | (reserved — aggregate network events) |

The simulator is the only publisher. FastAPI's `app/websockets/redis_relay.py`
subscribes once per channel at startup and fans out to every connected
client — adding more browser tabs doesn't add more Redis subscriptions.

## ML architecture

`POST /api/v1/ml/eta/predict` — see `backend/app/schemas/ml.py` for the
request/response contract. The model (`ml/models/eta_model.py`) is a small
Keras feed-forward regressor; `ml/preprocessing/eta_features.py` standardizes
numeric features and one-hot encodes categoricals, persisting its fit
parameters alongside the model so inference always matches training exactly.
Swap `ml/data/synthetic_eta_data.py` for a real query against
`package_events`/`packages` when real delivery history exists — the feature
contract doesn't need to change.

Future models (delay prediction, route risk, demand forecasting, anomaly
detection) follow the same `data/ → preprocessing/ → models/ → training/ →
inference/` pattern and get their own endpoint under `/api/v1/ml/`.

## Development phases

1. **Foundation** (done) — structure, models, migrations, seed data.
2. **Logistics engine** (done) — packages, orders, nodes, vehicles, riders
   (write endpoints via a `services/` layer), routes and events (read-only),
   package state machine enforced through `package_service`, plus
   `/api/v1/analytics/overview`.
3. **Real-time engine** (done) — simulator and Redis relay verified against
   live infrastructure: vehicle movement, package advancement, and
   congestion updates all flow through to a connected WebSocket client. Edge
   travel times are accelerated (`SIMULATION_TIME_ACCELERATION`, default
   30x) so a "real-time" demo doesn't mean waiting real hours for a highway
   leg to complete.
4. **GIS interface** (done) — Next.js + MapLibre control tower with live
   vehicle tracking, node click-through, and package tracking search.
   Confirmed rendering correctly with real screenshots (see note above).
5. **Control tower dashboard** (done) — all seven pages built: Network
   (map), Operations, Packages, Vehicles, Hubs, Analytics, AI Intelligence.
6. **TensorFlow ETA model** (done for the prototype) — trained, served, tested.
7. **Intelligence** (congestion/delay/risk/demand models) — not started.
8. **Production hardening** (auth, RBAC, monitoring) — not started.

## Replacing dummy data with real data

- Swap `scripts/seed_database.py`'s hardcoded `CITIES` dict for a query
  against your real facility/hub master data.
- Point `generate_dummy_packages.py`'s customer/merchant/order generation at
  your real order pipeline (or drop it — real orders will populate `orders`
  directly).
- The simulator's vehicle movement becomes unnecessary once real GPS
  telemetry exists — replace `simulator/engine.py`'s `move_vehicles` with a
  consumer that ingests real device pings and republishes to the same Redis
  channels, so the WebSocket/frontend layer needs no changes.
- Swap `ml/data/synthetic_eta_data.py` for a feature-engineering query over
  real `package_events` history; `ml/preprocessing/eta_features.py`'s
  contract (`FEATURE_COLUMNS`) stays the same.
