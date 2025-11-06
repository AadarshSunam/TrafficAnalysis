# Root Dockerfile - builds the Django / Celery image
FROM python:3.11-slim

# ---------------- system deps ----------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    netcat-openbsd \
    ffmpeg \
    libsm6 \
    libxrender1 \
    libglib2.0-0 \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# create non-root app user
ARG APP_USER=django
RUN useradd -m -s /bin/bash ${APP_USER}

WORKDIR /app

# ---------------- install python deps ----------------
COPY requirements.txt /app/requirements.txt

# upgrade pip and setuptools
RUN python -m pip install --upgrade pip setuptools wheel

# filter out remote git entries at build time (so a bad remote ref won't break all)
RUN grep -vE '(^-e |git\+)' /app/requirements.txt > /app/requirements_no_git.txt || true

# install the stable / filtered requirements
RUN pip install --no-cache-dir -r /app/requirements_no_git.txt

# ---------------- copy app code ----------------
COPY pipeline /app/pipeline
COPY backend /app/backend

# try to pip install pipeline if it's a pip package (harmless if not)
RUN pip install --no-cache-dir /app/pipeline || echo "Local pipeline install skipped or failed (not a package). Continuing."

# ---------------- entrypoint & permissions ----------------
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh \
    && chown -R ${APP_USER}:${APP_USER} /app

# drop to non-root user
USER ${APP_USER}

ENV PATH="/home/${APP_USER}/.local/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
# ensure both /app and /app/backend are on python path so "import pipeline" works
ENV PYTHONPATH="/app:/app/backend"

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
