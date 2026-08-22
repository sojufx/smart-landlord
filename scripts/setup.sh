#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not in your PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required."
  exit 1
fi

mkdir -p secrets
umask 077

if [[ ! -s secrets/db_password.txt ]]; then
  openssl rand -hex 24 > secrets/db_password.txt 2>/dev/null || head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1 > secrets/db_password.txt
fi

if [[ ! -s secrets/jwt_secret.txt ]]; then
  openssl rand -hex 32 > secrets/jwt_secret.txt 2>/dev/null || head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1 > secrets/jwt_secret.txt
fi

if [[ ! -f .env ]]; then
  GENERATED_PASSWORD="SL-$(openssl rand -base64 15 2>/dev/null | tr '+/' '-_' | cut -c1-16 || head -c 12 /dev/urandom | base64 | tr '+/' '-_' | cut -c1-16)"
  cat > .env <<EOF
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$GENERATED_PASSWORD}
SEED_DEMO=${SEED_DEMO:-true}
APP_PORT=${APP_PORT:-8080}
EOF
  echo "Created .env with your first sign-in details."
else
  echo "Using the existing .env file."
fi

docker compose up -d --build

echo
echo "Smart Landlord is starting."
echo "Open: http://localhost:${APP_PORT:-8080}"
echo "Email and password are stored in .env under ADMIN_EMAIL and ADMIN_PASSWORD."
echo "For real records, set SEED_DEMO=false in .env before the first database start."
