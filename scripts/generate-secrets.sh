#!/bin/bash
# Creates the .env file next to docker-compose.yml with strong random passwords.
# Run it once:   ./scripts/generate-secrets.sh
# It never overwrites an existing .env (that would lock you out of your database).
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists — keeping it. (Delete it only if you also reset the database: docker compose down -v)"
  exit 0
fi

rand() { openssl rand -hex 24; }   # 48 hex characters, safe inside URLs

umask 077   # file readable only by you
cat > .env <<ENV
# Docker secrets for GharKhoji — generated $(date +%F). NEVER commit or share this file.
POSTGRES_PASSWORD=$(rand)
APP_DB_USER=gharkhoji_app
APP_DB_PASSWORD=$(rand)
REDIS_PASSWORD=$(rand)
ENV

echo "✅ Created .env with random passwords for Postgres and Redis."
