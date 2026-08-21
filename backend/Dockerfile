FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend:/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY ml /app/ml
COPY simulator /app/simulator
COPY scripts /app/scripts

RUN chmod +x /app/backend/docker-entrypoint.sh

WORKDIR /app/backend

EXPOSE 8000

# Cloud platforms (Railway, Render, ...) inject a dynamic $PORT and expect
# the process to bind to it; docker-entrypoint.sh falls back to 8000 for
# local `docker compose up`. The worker service overrides this command
# entirely (python -m simulator.engine) — see README's deployment section.
CMD ["./docker-entrypoint.sh"]
