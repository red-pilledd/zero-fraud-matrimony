from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import DEV_MODE
from database import init_db
from routes_admin import router as admin_router
from routes_ai import router as ai_router
from routes_flags import router as flags_router
from routes_internal import router as internal_router
from routes_interview import router as interview_router
from routes_messages import router as messages_router
from routes_photos import router as photos_router
from routes_relationships import router as relationships_router
from routes_users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    if DEV_MODE:
        print("DEV_MODE is ON -- API calls and phone validation are disabled")
    await init_db()
    yield


app = FastAPI(
    title="Zero-Fraud Matrimony API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _cors_safe_500(request: Request, exc: Exception) -> JSONResponse:
    """Return 500s with CORS headers so the browser can read the real error message."""
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )


app.include_router(admin_router)
app.include_router(ai_router)
app.include_router(interview_router)
app.include_router(flags_router)
app.include_router(internal_router)
app.include_router(messages_router)
app.include_router(photos_router)
app.include_router(relationships_router)
app.include_router(users_router)

# Serve uploaded photos as static files at /static/photos/{user_id}/{filename}
_static_photos = Path(__file__).parent / "static" / "photos"
_static_photos.mkdir(parents=True, exist_ok=True)
app.mount("/static/photos", StaticFiles(directory=str(_static_photos)), name="photos")


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
