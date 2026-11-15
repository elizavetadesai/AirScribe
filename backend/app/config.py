"""Settings from environment variables (see backend/.env.example)."""
from __future__ import annotations

import os
import secrets
import warnings
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'airscribe.db'}")
    # Render/Heroku give postgres://...; SQLAlchemy + psycopg 3 want postgresql+psycopg://
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _database_url()
JWT_SECRET = os.getenv("JWT_SECRET") or ""
if not JWT_SECRET:
    JWT_SECRET = secrets.token_urlsafe(32)
    warnings.warn("JWT_SECRET not set: using a random one, so logins reset on every restart. "
                  "Set JWT_SECRET in production.", stacklevel=1)
TOKEN_HOURS = float(os.getenv("TOKEN_HOURS", "12"))
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX") or None  # e.g. https://airscribe-.*\.vercel\.app
MODEL_DIR = Path(os.getenv("MODEL_DIR", str(BACKEND_DIR / "models")))
MAX_POINTS = int(os.getenv("MAX_POINTS", "5000"))

# Data collection (/collect page uploads). Both empty = collection upload disabled.
COLLECT_CODE = os.getenv("COLLECT_CODE", "")            # short team code put in the collect link
COLLECT_ADMIN_KEY = os.getenv("COLLECT_ADMIN_KEY", "")  # long secret for summary/export
