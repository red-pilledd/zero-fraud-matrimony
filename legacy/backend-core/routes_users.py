import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import IntentSilo, Lead, User, UserPhoto
from schemas import DiscoverUserRead, ProfileUpdate, UserRead

router = APIRouter(prefix="/users", tags=["users"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.put(
    "/{user_id}/profile",
    response_model=UserRead,
    summary="Update a user's extended profile fields",
)
async def update_profile(
    user_id: int,
    payload: ProfileUpdate,
    db: DbSession,
) -> User:
    user = await db.scalar(select(User).where(User.id == user_id))

    if user is None:
        # Auto-promote a completed Lead to User on first profile save.
        lead = await db.scalar(select(Lead).where(Lead.id == user_id))
        if lead is None or not lead.ai_interview_completed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found.",
            )
        identity_hash = hashlib.sha256(lead.phone_number.encode()).hexdigest()
        user = User(
            id=lead.id,
            identity_hash=identity_hash,
            intent_silo=IntentSilo.MATRIMONY,
            stake_balance=0,
            lead_description=lead.lead_description,
            compatibility_blueprint=lead.compatibility_blueprint,
        )
        db.add(user)
        await db.flush()

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.get(
    "/discover",
    response_model=list[DiscoverUserRead],
    summary="Discovery feed — users in same intent silo, excluding self and banned",
)
async def discover_users(
    current_user_id: int,
    request: Request,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[DiscoverUserRead]:
    """Return a paginated list of profiles the current user can browse.

    Rules (per CLAUDE.md Intent Silo directive):
    - Same intent_silo as current user — enforced at the query layer
    - Excludes banned users
    - Excludes the current user themselves
    - Ordered by id descending (newest members first)
    - Primary photo URL is resolved to an absolute URL; null if no photo uploaded
    """
    current = await db.scalar(select(User).where(User.id == current_user_id))
    if current is None:
        return []  # user hasn't completed onboarding yet — return empty feed

    result = await db.scalars(
        select(User)
        .where(
            User.intent_silo == current.intent_silo,
            User.is_banned == False,  # noqa: E712
            User.id != current_user_id,
        )
        .order_by(User.id.desc())
        .offset(offset)
        .limit(limit)
    )
    users = list(result.all())

    base_url = str(request.base_url).rstrip("/")

    cards: list[DiscoverUserRead] = []
    for user in users:
        # Resolve primary photo URL for this user
        primary_result = await db.scalars(
            select(UserPhoto)
            .where(
                UserPhoto.user_id == str(user.id),
                UserPhoto.is_primary == True,  # noqa: E712
            )
            .limit(1)
        )
        primary = primary_result.first()
        photo_url: str | None = (
            f"{base_url}/static/photos/{user.id}/{primary.filename}" if primary else None
        )

        cards.append(
            DiscoverUserRead(
                id=user.id,
                age=user.age,
                height_cm=user.height_cm,
                religion=user.religion,
                mother_tongue=user.mother_tongue,
                nationality=user.nationality,
                country_of_residence=user.country_of_residence,
                state=user.state,
                city=user.city,
                education_level=user.education_level,
                occupation=user.occupation,
                annual_income=user.annual_income,
                lead_description=user.lead_description,
                profile_confidence=user.profile_confidence,
                primary_photo_url=photo_url,
                is_physically_verified=user.is_physically_verified,
            )
        )

    return cards
