#!/bin/sh
# Backend container entrypoint for the web service. Runs migrations and
# idempotent seed/generator scripts before starting the API, so a fresh
# cloud deploy needs zero manual database steps. Every script here is safe
# to run on every boot — each checks for existing data and skips if already
# populated, so redeploys/restarts don't re-seed or duplicate data.
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding logistics network (skips if already seeded)..."
python /app/scripts/seed_database.py

echo "Generating synthetic packages (skips if already populated)..."
python /app/scripts/generate_dummy_packages.py --count 500

echo "Backfilling package events (skips if already populated)..."
python /app/scripts/generate_dummy_events.py

echo "Starting API server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
