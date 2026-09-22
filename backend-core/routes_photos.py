"""
Photo upload, retrieval, deletion, and primary-setting routes.

Files are stored at:  backend-core/static/photos/{user_id}/{uuid}.jpg
Served statically at: GET /static/photos/{user_id}/{uuid}.jpg
"""

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UserPhoto
from schemas import PhotoRead

router = APIRouter(prefix="/photos", tags=["photos"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

# Photos are stored relative to this file's directory
PHOTO_DIR = Path(__file__).parent / "static" / "photos"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB


def _photo_dir(user_id: str) -> Path:
    d = PHOTO_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _photo_url(request: Request, user_id: str, filename: str) -> str:
    return str(request.base_url) + f"static/photos/{user_id}/{filename}"


def _to_read(photo: UserPhoto, request: Request) -> PhotoRead:
    return PhotoRead(
        id=photo.id,
        user_id=photo.user_id,
        filename=photo.filename,
        is_primary=photo.is_primary,
        sort_order=photo.sort_order,
        url=_photo_url(request, photo.user_id, photo.filename),
        created_at=photo.created_at,
    )

@router.get(
    "/{user_id}",
    response_model=list[PhotoRead],
    summary="List all photos for a user, primary first",
)
async def list_photos(user_id: str, request: Request, db: DbSession) -> list[PhotoRead]:
    result = await db.scalars(
        select(UserPhoto)
        .where(UserPhoto.user_id == user_id)
        .order_by(UserPhoto.is_primary.desc(), UserPhoto.sort_order.asc())
    )
    return [_to_read(p, request) for p in result.all()]


@router.post(
    "/{user_id}",
    response_model=PhotoRead,
    status_code=201,
    summary="Upload a new photo (multipart/form-data, field name: file)",
)
async def upload_photo(
    user_id: str,
    request: Request,
    db: DbSession,
    file: UploadFile = File(...),
) -> PhotoRead:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are accepted.")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 8 MB limit.")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    (_photo_dir(user_id) / filename).write_bytes(data)

    # First photo is automatically the primary
    existing_count_result = await db.scalars(
        select(UserPhoto).where(UserPhoto.user_id == user_id)
    )
    existing = list(existing_count_result.all())
    is_primary = len(existing) == 0

    photo = UserPhoto(
        user_id=user_id,
        filename=filename,
        is_primary=is_primary,
        sort_order=len(existing),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return _to_read(photo, request)


@router.patch(
    "/{user_id}/{photo_id}/primary",
    response_model=PhotoRead,
    summary="Set a photo as the primary (profile) photo",
)
async def set_primary(user_id: str, photo_id: int, request: Request, db: DbSession) -> PhotoRead:
    photo = await db.get(UserPhoto, photo_id)
    if not photo or photo.user_id != user_id:
        raise HTTPException(status_code=404, detail="Photo not found.")

    # Clear existing primary for this user
    await db.execute(
        update(UserPhoto)
        .where(UserPhoto.user_id == user_id)
        .values(is_primary=False)
    )
    photo.is_primary = True
    await db.commit()
    await db.refresh(photo)
    return _to_read(photo, request)


@router.delete(
    "/{user_id}/{photo_id}",
    status_code=204,
    summary="Delete a photo (removes file from disk and DB record)",
)
async def delete_photo(user_id: str, photo_id: int, db: DbSession) -> None:
    photo = await db.get(UserPhoto, photo_id)
    if not photo or photo.user_id != user_id:
        raise HTTPException(status_code=404, detail="Photo not found.")

    # Remove file from disk (ignore if already missing)
    file_path = _photo_dir(user_id) / photo.filename
    file_path.unlink(missing_ok=True)

    await db.delete(photo)
    await db.commit()

    # If the deleted photo was primary, promote the next one automatically
    if photo.is_primary:
        next_result = await db.scalars(
            select(UserPhoto)
            .where(UserPhoto.user_id == user_id)
            .order_by(UserPhoto.sort_order.asc())
            .limit(1)
        )
        next_photo = next_result.first()
        if next_photo:
            next_photo.is_primary = True
            await db.commit()
