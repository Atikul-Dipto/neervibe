# Logistics Control Tower

A real-time logistics management and network visualization platform, built
on synthetic Bangladesh logistics data with a production-ready architecture
so real data can be connected later.

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
- **FastAPI gateway** — health/readiness, nodes, packages, tracking, and ML
  ETA prediction endpoints, all backed by real DB queries (no mocked
  responses). WebSocket endpoints (`/ws/live/*`) relay whatever the
  simulator publishes to Redis.
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
- **Tests** — 15 tests covering the state machine, ETA feature pipeline, app
  boot/health, and the trained ML endpoint. All passing (`pytest`).

## What's NOT built yet

- **Frontend** (React/Next.js control tower UI, interactive map, dashboards)
  — Phase 4/5.
- Write endpoints for packages/orders/vehicles/riders, and the
  vehicles/riders/routes/events/analytics routers — Phase 2.
- Auth/RBAC enforcement (architecture is auth-ready; not wired up yet).
- This machine has no Docker and no local PostgreSQL/Redis, so the DB
  container, Alembic migration run, and seed scripts have been verified for
  syntax/imports but **not** executed against a live database. Run the
  commands below on a machine with Docker to complete that verification.

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

### 9. Run tests

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
2. **Logistics engine** (partial) — packages/nodes/routes read APIs exist;
   write endpoints and vehicles/riders CRUD are next.
3. **Real-time engine** (partial) — simulator and Redis relay exist; not yet
   run against live infrastructure in this environment.
4. **GIS interface** — not started (needs `frontend/`).
5. **Control tower dashboard** — not started.
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
