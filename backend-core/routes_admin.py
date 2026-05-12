from typing import Annotated

import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Lead, User
from schemas import LeadCreate, LeadPromoteRequest, LeadRead, UserRead

router = APIRouter(prefix="/admin", tags=["admin"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/leads",
    response_model=LeadRead,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a manual lead (newspaper / local network)",
)
async def ingest_lead(payload: LeadCreate, db: DbSession) -> Lead:
    """
    Creates a Lead record for someone sourced offline (e.g. 'Ward 14 manual').
    No identity hash is set at this stage — that happens when the lead
    completes Aadhaar upload and is promoted to a User.
    """
    existing = await db.scalar(
        select(Lead).where(Lead.phone_number == payload.phone_number)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Lead with phone number '{payload.phone_number}' already exists.",
        )

    lead = Lead(
        phone_number=payload.phone_number,
        source=payload.source,
        ai_interview_completed=payload.ai_interview_completed,
        compatibility_blueprint=payload.compatibility_blueprint,
    )
    db.add(lead)
    await db.flush()   # populate lead.id before the session commits in get_db
    return lead


@router.post(
    "/leads/{lead_id}/promote",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Promote a lead to a full User after Aadhaar verification",
)
async def promote_lead(
    lead_id: int,
    payload: LeadPromoteRequest,
    db: DbSession,
) -> User:
    """
    Converts a Lead into a User once the caller supplies the raw Aadhaar string
    and selects an intent silo. The raw string is hashed server-side and never
    persisted.

    Guards:
    - 404 if the lead does not exist.
    - 409 if the derived hash is already registered (duplicate or blacklisted actor).
    """
    lead = await db.scalar(select(Lead).where(Lead.id == lead_id))
    if lead is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found.",
        )

    identity_hash = hashlib.sha256(payload.raw_id_string.encode()).hexdigest()

    hash_taken = await db.scalar(
        select(User).where(User.identity_hash == identity_hash)
    )
    if hash_taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This identity is already registered. "
                   "If this is a fraud attempt, the hash has been logged.",
        )

    user = User(
        identity_hash=identity_hash,
        intent_silo=payload.intent_silo,
        stake_balance=100,
        reputation_score=0,
        is_physically_verified=True,
    )
    db.add(user)
    await db.flush()

    await db.delete(lead)
    return user
