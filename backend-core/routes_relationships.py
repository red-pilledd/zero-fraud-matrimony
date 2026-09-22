from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UserRelationship
from schemas import RelationshipRead

router = APIRouter(prefix="/relationships", tags=["relationships"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

PHOTO_REVEAL_THRESHOLD = 15


@router.get(
    "/{user_id}/{partner_id}",
    response_model=RelationshipRead,
    summary="Get (or initialise) the relationship between two users",
)
async def get_relationship(
    user_id: str,
    partner_id: str,
    db: DbSession,
) -> UserRelationship:
    rel = await db.scalar(
        select(UserRelationship).where(
            UserRelationship.user_id == user_id,
            UserRelationship.partner_id == partner_id,
        )
    )

    # Check reverse direction — if the other user already unlocked, honour it
    reverse = await db.scalar(
        select(UserRelationship).where(
            UserRelationship.user_id == partner_id,
            UserRelationship.partner_id == user_id,
        )
    )
    already_unlocked = (reverse is not None and reverse.photo_unlocked)

    if rel is None:
        rel = UserRelationship(
            user_id=user_id,
            partner_id=partner_id,
            photo_unlocked=already_unlocked,
        )
        db.add(rel)
        await db.commit()
        await db.refresh(rel)
    elif already_unlocked and not rel.photo_unlocked:
        rel.photo_unlocked = True
        await db.commit()
        await db.refresh(rel)

    return rel


@router.patch(
    "/{user_id}/{partner_id}/unlock",
    response_model=RelationshipRead,
    summary="Permanently unlock photos for this relationship (called by chat server)",
)
async def unlock_photos(
    user_id: str,
    partner_id: str,
    db: DbSession,
) -> UserRelationship:
    rel = await db.scalar(
        select(UserRelationship).where(
            UserRelationship.user_id == user_id,
            UserRelationship.partner_id == partner_id,
        )
    )
    if rel is None:
        rel = UserRelationship(user_id=user_id, partner_id=partner_id, photo_unlocked=True)
        db.add(rel)
    else:
        rel.photo_unlocked = True
    await db.commit()
    await db.refresh(rel)
    return rel


@router.patch(
    "/{user_id}/{partner_id}/increment",
    response_model=RelationshipRead,
    summary="Increment message count; unlock photo once threshold is reached",
)
async def increment_message_count(
    user_id: str,
    partner_id: str,
    db: DbSession,
) -> UserRelationship:
    # Forward row
    rel = await db.scalar(
        select(UserRelationship).where(
            UserRelationship.user_id == user_id,
            UserRelationship.partner_id == partner_id,
        )
    )
    if rel is None:
        rel = UserRelationship(user_id=user_id, partner_id=partner_id, message_count=1)
        db.add(rel)
    else:
        rel.message_count += 1

    # Reverse row — kept in sync so both rows reflect TOTAL conversation messages.
    # This matches the socket server which counts all messages from either party.
    reverse = await db.scalar(
        select(UserRelationship).where(
            UserRelationship.user_id == partner_id,
            UserRelationship.partner_id == user_id,
        )
    )
    if reverse is None:
        reverse = UserRelationship(
            user_id=partner_id,
            partner_id=user_id,
            message_count=rel.message_count,
        )
        db.add(reverse)
    else:
        reverse.message_count += 1

    # Unlock both sides together once the threshold is crossed
    if not rel.photo_unlocked and rel.message_count >= PHOTO_REVEAL_THRESHOLD:
        rel.photo_unlocked = True
        reverse.photo_unlocked = True

    await db.commit()
    await db.refresh(rel)
    return rel
