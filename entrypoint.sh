#!/usr/bin/env bash
set -euo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
APP_PORT="${APP_PORT:-8000}"

echo "Waiting for Postgres at ${POSTGRES_HOST}:${POSTGRES_PORT} ..."
until nc -z "${POSTGRES_HOST}" "${POSTGRES_PORT}"; do
  printf '.'
  sleep 0.5
done
echo -e "\nPostgres is available."

# include app root and backend in PYTHONPATH
export PYTHONPATH="/app:/app/backend:${PYTHONPATH:-}"

cd /app/backend

echo "Running migrations..."
python manage.py migrate --noinput

# Create superuser if env vars present using manage.py shell (ensures Django apps are loaded)
python manage.py shell <<'PY'
from django.contrib.auth import get_user_model
import os
User = get_user_model()
username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
email = os.environ.get("DJANGO_SUPERUSER_EMAIL")
password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
if username and email and password:
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(username, email, password)
        print(f"Superuser {username} created")
    else:
        print(f"Superuser {username} already exists")
else:
    print("Superuser env not set; skipping auto-create")
PY

if [ "${DJANGO_COLLECTSTATIC:-0}" = "1" ]; then
  echo "Collecting static files..."
  python manage.py collectstatic --noinput
fi

echo "Starting Daphne on 0.0.0.0:${APP_PORT}..."
exec daphne -b 0.0.0.0 -p "${APP_PORT}" core.asgi:application
