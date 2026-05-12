from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from database import init_db
from routes_admin import router as admin_router
from routes_ai import router as ai_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_db()
    yield


app = FastAPI(
    title="Zero-Fraud Matrimony API",
    version="0.1.0",
    lifespan=lifespan,
)


app.include_router(admin_router)
app.include_router(ai_router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
