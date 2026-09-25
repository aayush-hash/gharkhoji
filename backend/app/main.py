import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

import app.models  # noqa: F401  (registers all tables)
from app.core.config import settings
from app.core.database import engine
from app.core.redis import redis_client
from app.modules.auth.router import router as auth_router
from app.modules.listings.router import router as listings_router
from app.modules.media.router import mount_local_files
from app.modules.media.router import router as media_router
from app.modules.notifications.router import router as notifications_router
from app.modules.search.router import router as search_router
from app.modules.users.router import router as users_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.4.0",
    lifespan=lifespan,
    # Hide interactive docs in production
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(users_router, prefix=settings.API_V1_PREFIX)
app.include_router(listings_router, prefix=settings.API_V1_PREFIX)
app.include_router(media_router, prefix=settings.API_V1_PREFIX)
app.include_router(search_router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications_router, prefix=settings.API_V1_PREFIX)
mount_local_files(app)


@app.get("/health", tags=["health"])
async def health() -> JSONResponse:
    checks = {"database": "ok", "redis": "ok"}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        checks["database"] = "down"
    try:
        await redis_client.ping()
    except Exception:
        checks["redis"] = "down"
    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse({"status": "ok" if healthy else "degraded", **checks}, status_code=200 if healthy else 503)
