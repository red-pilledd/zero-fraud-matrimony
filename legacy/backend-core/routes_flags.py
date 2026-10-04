import os
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Flag, FlagSource, User
from schemas import FlagCreate, FlagRead

router = APIRouter(tags=["flags"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

_CHAT_BASE = os.environ.get("CHAT_BASE", "http://localhost:3001")
_FLAG_THRESHOLD = 3  # flags required before permanent ban


async def _get_message_count(user_a: int, user_b: int) -> int:
    """Ask the chat server how many messages two users have exchanged."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{_CHAT_BASE}/internal/message-count",
                params={"userA": str(user_a), "userB": str(user_b)},
            )
            r.raise_for_status()
            return int(r.json().get("count", 0))
    except Exception:
        # If the chat server is unreachable, fail safe by blocking the flag
        return 0


async def _apply_ban(user: User, db: AsyncSession) -> None:
    user.is_banned = True
    print(f"[ban] user_id={user.id}  identity_hash={user.identity_hash[:8]}…  PERMANENTLY BANNED")


# ---------------------------------------------------------------------------
# POST /users/{flagged_user_id}/flag
# ---------------------------------------------------------------------------

@router.post(
    "/users/{flagged_user_id}/flag",
    response_model=FlagRead,
    status_code=status.HTTP_201_CREATED,
    summary="Flag a user — 3 verified flags triggers a permanent ban",
)
async def flag_user(
    flagged_user_id: int,
    payload: FlagCreate,
    db: DbSession,
    flagger_id: int = Query(..., description="ID of the verified user filing the flag"),
) -> Flag:
    # ── Guard: flagger must exist and be verified, not banned ────────────────
    flagger = await db.scalar(select(User).where(User.id == flagger_id))
    if flagger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flagger not found.")
    if not flagger.is_physically_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only verified users can submit flags.",
        )
    if flagger.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Banned users cannot flag.")

    # ── Guard: flagged user must exist ───────────────────────────────────────
    flagged = await db.scalar(select(User).where(User.id == flagged_user_id))
    if flagged is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flagged user not found.")

    # ── Guard: cannot flag yourself ──────────────────────────────────────────
    if flagger_id == flagged_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot flag yourself.")

    # ── Guard: minimum 3 messages exchanged ─────────────────────────────────
    msg_count = await _get_message_count(flagger_id, flagged_user_id)
    if msg_count < 3:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have exchanged at least 3 messages before filing a flag.",
        )

    # ── Guard: cannot flag the same person twice ─────────────────────────────
    duplicate = await db.scalar(
        select(Flag).where(
            Flag.flagger_user_id == flagger_id,
            Flag.flagged_user_id == flagged_user_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already flagged this user.",
        )

    # ── Create flag ──────────────────────────────────────────────────────────
    flag = Flag(
        flagger_user_id=flagger_id,
        flagged_user_id=flagged_user_id,
        reason=payload.reason,
        source=FlagSource.USER,
    )
    db.add(flag)
    await db.flush()

    # ── Check ban threshold ──────────────────────────────────────────────────
    total_flags = await db.scalar(
        select(func.count()).where(Flag.flagged_user_id == flagged_user_id)
    )
    if total_flags >= _FLAG_THRESHOLD:
        await _apply_ban(flagged, db)

    return flag
