import asyncio
import os
from typing import Annotated

import anthropic
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Flag, FlagSource, User

load_dotenv()

router = APIRouter(prefix="/internal", tags=["internal"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

_FLAG_THRESHOLD = 3
_MODEL = "claude-haiku-4-5-20251001"
_ANTHROPIC_CLIENT = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# ---------------------------------------------------------------------------
# Shared request schema
# ---------------------------------------------------------------------------

class SystemFlagRequest(BaseModel):
    user_id: str
    reason: str


# ---------------------------------------------------------------------------
# Profile consistency tool
# ---------------------------------------------------------------------------

_CONSISTENCY_TOOL: anthropic.types.ToolParam = {
    "name": "assess_profile_consistency",
    "description": (
        "Compare a user's matrimony interview profile against a sample of their "
        "recent chat messages and assess how consistent their behaviour is with "
        "what they stated during the interview."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "confidence": {
                "type": "string",
                "enum": ["HIGH", "MEDIUM", "LOW"],
                "description": (
                    "HIGH: chat strongly aligns with stated profile. "
                    "MEDIUM: minor or ambiguous inconsistencies. "
                    "LOW: significant contradictions — stated values differ from chat behaviour."
                ),
            },
            "reason": {
                "type": "string",
                "maxLength": 200,
                "description": "One sentence explaining the assessment.",
            },
        },
        "required": ["confidence", "reason"],
    },
}

_CONSISTENCY_SYSTEM = (
    "You are a profile integrity checker for a zero-fraud matrimony platform. "
    "You will receive a user's interview profile (their stated values, family preferences, "
    "career priority, non-negotiables) and a sample of their recent chat messages. "
    "Assess whether the chat behaviour is consistent with the stated profile. "
    "Be charitable for vague chats — only mark LOW when there is clear contradiction. "
    "Call assess_profile_consistency with your verdict."
)


async def _analyze_one_user(user: User, messages_as_sender: list[str]) -> str | None:
    """Returns 'HIGH'|'MEDIUM'|'LOW', or None if blueprint is missing."""
    if not user.compatibility_blueprint or not messages_as_sender:
        return None

    chat_sample = "\n".join(f"- {m}" for m in messages_as_sender[-20:])
    profile_text = (
        f"Interview Profile:\n{user.compatibility_blueprint}\n\n"
        f"Personal Description: {user.lead_description or 'Not available'}\n\n"
        f"Recent chat messages sent by this user:\n{chat_sample}"
    )

    response = await _ANTHROPIC_CLIENT.messages.create(
        model=_MODEL,
        max_tokens=256,
        system=_CONSISTENCY_SYSTEM,
        tools=[_CONSISTENCY_TOOL],
        tool_choice={"type": "tool", "name": "assess_profile_consistency"},
        messages=[{"role": "user", "content": profile_text}],
    )
    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_block is None:
        return None
    confidence: str = tool_block.input["confidence"]
    reason: str = tool_block.input.get("reason", "")
    print(f"[consistency]  user_id={user.id}  confidence={confidence}  reason={reason}")
    return confidence


# ---------------------------------------------------------------------------
# POST /internal/instant-ban
# ---------------------------------------------------------------------------

@router.post(
    "/instant-ban",
    status_code=status.HTTP_200_OK,
    summary="Instantly ban a user for money/pressure violations — called by chat server",
)
async def instant_ban(payload: SystemFlagRequest, db: DbSession) -> dict:
    try:
        user_id_int = int(payload.user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user_id.")

    user = await db.scalar(select(User).where(User.id == user_id_int))
    if user is None or user.is_banned:
        return {"status": "noop"}

    user.is_banned = True
    flag = Flag(
        flagger_user_id=None,
        flagged_user_id=user_id_int,
        reason=payload.reason,
        source=FlagSource.SYSTEM,
    )
    db.add(flag)
    print(f"[INSTANT_BAN] user_id={user_id_int}  reason={payload.reason}  PERMANENTLY BANNED")
    return {"status": "banned"}


# ---------------------------------------------------------------------------
# POST /internal/system-flag
# ---------------------------------------------------------------------------

@router.post(
    "/system-flag",
    status_code=status.HTTP_201_CREATED,
    summary="File a system-generated flag — 3 total flags triggers a ban",
)
async def system_flag(payload: SystemFlagRequest, db: DbSession) -> dict:
    try:
        user_id_int = int(payload.user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user_id.")

    user = await db.scalar(select(User).where(User.id == user_id_int))
    if user is None or user.is_banned:
        return {"status": "noop"}

    existing = await db.scalar(
        select(Flag).where(
            Flag.flagged_user_id == user_id_int,
            Flag.source == FlagSource.SYSTEM,
            Flag.reason == payload.reason,
        )
    )
    if existing is not None:
        return {"status": "duplicate"}

    flag = Flag(
        flagger_user_id=None,
        flagged_user_id=user_id_int,
        reason=payload.reason,
        source=FlagSource.SYSTEM,
    )
    db.add(flag)
    await db.flush()

    total_flags = await db.scalar(
        select(func.count()).where(Flag.flagged_user_id == user_id_int)
    )
    if total_flags >= _FLAG_THRESHOLD:
        user.is_banned = True
        print(f"[ban] user_id={user_id_int}  SYSTEM FLAG THRESHOLD REACHED  PERMANENTLY BANNED")

    return {"status": "flagged", "total_flags": total_flags}


# ---------------------------------------------------------------------------
# POST /internal/analyze-consistency
# ---------------------------------------------------------------------------

class MessageEntry(BaseModel):
    userId: str
    content: str = Field(..., min_length=1, max_length=2000)


class ConsistencyRequest(BaseModel):
    user_id_a: str
    user_id_b: str
    messages: list[MessageEntry] = Field(..., min_length=1, max_length=40)


@router.post(
    "/analyze-consistency",
    status_code=status.HTTP_200_OK,
    summary="Compare both users' chat messages against their interview profiles",
)
async def analyze_consistency(payload: ConsistencyRequest, db: DbSession) -> dict:
    try:
        id_a = int(payload.user_id_a)
        id_b = int(payload.user_id_b)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user IDs.")

    user_a, user_b = await asyncio.gather(
        db.scalar(select(User).where(User.id == id_a)),
        db.scalar(select(User).where(User.id == id_b)),
    )

    # Split messages by sender
    msgs_a = [m.content for m in payload.messages if m.userId == payload.user_id_a]
    msgs_b = [m.content for m in payload.messages if m.userId == payload.user_id_b]

    # Run both analyses in parallel — skip users with no blueprint
    results = await asyncio.gather(
        _analyze_one_user(user_a, msgs_a) if user_a else asyncio.sleep(0),
        _analyze_one_user(user_b, msgs_b) if user_b else asyncio.sleep(0),
    )

    confidence_a, confidence_b = results

    if user_a and confidence_a:
        user_a.profile_confidence = confidence_a
    if user_b and confidence_b:
        user_b.profile_confidence = confidence_b

    return {
        "user_id_a": {"confidence": confidence_a},
        "user_id_b": {"confidence": confidence_b},
    }
