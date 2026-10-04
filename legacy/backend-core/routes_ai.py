import os
from typing import Annotated

import anthropic
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Lead
from schemas import LeadRead
from schemas_ai import CompatibilityBlueprint

load_dotenv()

router = APIRouter(prefix="/leads", tags=["ai"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

_ANTHROPIC_CLIENT = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# JSON schema mirroring CompatibilityBlueprint — used as the tool input_schema
# so the model is forced to return data we can validate directly with Pydantic.
_BLUEPRINT_TOOL: anthropic.types.ToolParam = {
    "name": "extract_blueprint",
    "description": (
        "Extract a structured compatibility profile from an AI interview transcript. "
        "All fields are required."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "financial_expectation": {
                "type": "string",
                "minLength": 1,
                "maxLength": 500,
                "description": "Candidate's financial expectations and attitudes toward money.",
            },
            "family_structure_preference": {
                "type": "string",
                "enum": ["JOINT", "NUCLEAR", "FLEXIBLE"],
                "description": "Preferred living / family arrangement after marriage.",
            },
            "career_priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10,
                "description": "How central career is to the candidate's identity (1 = low, 10 = high).",
            },
            "core_values": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 3,
                "description": "Up to 3 core values the candidate holds (e.g. Integrity, Family).",
            },
            "non_negotiables": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "description": "Absolute deal-breakers for the candidate.",
            },
        },
        "required": [
            "financial_expectation",
            "family_structure_preference",
            "career_priority",
            "core_values",
            "non_negotiables",
        ],
    },
}

_SYSTEM_PROMPT = (
    "You are the AI Arbitrator for a zero-fraud matrimony platform. "
    "Your only job is to analyse the interview transcript provided by the user "
    "and call the `extract_blueprint` tool with the candidate's compatibility profile. "
    "Be precise and grounded in the transcript — do not invent information."
)


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class TranscriptRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=20_000)


# ---------------------------------------------------------------------------
# LLM call — tool use forces schema-compliant output
# ---------------------------------------------------------------------------

async def extract_blueprint_from_llm(transcript: str) -> CompatibilityBlueprint:
    response = await _ANTHROPIC_CLIENT.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        tools=[_BLUEPRINT_TOOL],
        tool_choice={"type": "tool", "name": "extract_blueprint"},
        messages=[{"role": "user", "content": transcript}],
    )

    tool_block = next(
        (block for block in response.content if block.type == "tool_use"),
        None,
    )
    if tool_block is None:
        raise ValueError("Model did not return a tool_use block — cannot extract blueprint.")

    return CompatibilityBlueprint.model_validate(tool_block.input)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/{lead_id}/generate-blueprint",
    response_model=LeadRead,
    summary="Run AI interview transcript through Arbitrator and persist blueprint",
)
async def generate_blueprint(
    lead_id: int,
    payload: TranscriptRequest,
    db: DbSession,
) -> Lead:
    lead = await db.scalar(select(Lead).where(Lead.id == lead_id))
    if lead is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found.",
        )

    blueprint: CompatibilityBlueprint = await extract_blueprint_from_llm(payload.transcript)

    lead.compatibility_blueprint = blueprint.model_dump()
    lead.ai_interview_completed = True
    return lead
