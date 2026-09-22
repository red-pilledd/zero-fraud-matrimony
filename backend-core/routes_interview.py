import asyncio
import os
from typing import Annotated

import anthropic
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import DEV_MODE
from database import get_db
from models import InterviewSession, Lead
from schemas import InterviewSessionRead, LeadRead, RespondRequest, RespondResult
from schemas_ai import CompatibilityBlueprint, PersonDescription

load_dotenv()

router = APIRouter(prefix="/interview", tags=["interview"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

# Only instantiate when DEV_MODE is False so a missing API key never causes a
# startup crash in a pure-dev environment.
_ANTHROPIC_CLIENT: anthropic.AsyncAnthropic | None = (
    None if DEV_MODE
    else anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
)

_MODEL = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# Dev-mode mock data
# ---------------------------------------------------------------------------

_MOCK_SCENARIO: dict = {
    "scenario": "This is a test question. Pick any option.",
    "options": ["Option A", "Option B", "Option C", "Option D"],
}
_MOCK_SCENARIOS: list[dict] = [_MOCK_SCENARIO] * 6
_MOCK_BIO = "This is a mock AI-generated bio for testing purposes."
_MOCK_BLUEPRINT: dict = {"values": "test", "dealbreakers": "none"}

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

_SCENARIOS_TOOL: anthropic.types.ToolParam = {
    "name": "generate_interview_scenarios",
    "description": (
        "Generate exactly 6 unique situational scenarios for a matrimony compatibility interview. "
        "Cover these topics in order: 1) finances, 2) family structure, 3) career priority, "
        "4) conflict resolution, 5) core values, 6) dealbreakers. "
        "Each scenario must feel like a realistic situation an Indian couple would face. "
        "Each scenario must include exactly 4 multiple-choice options (A–D) that reveal different "
        "personality types — ranging from traditional to modern, pragmatic to idealistic. "
        "Options must be written in first person ('I would...'). "
        "Never repeat scenarios from any previous session."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "scenarios": {
                "type": "array",
                "minItems": 6,
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "properties": {
                        "scenario": {
                            "type": "string",
                            "description": "The situational question in the candidate's language.",
                        },
                        "options": {
                            "type": "array",
                            "minItems": 4,
                            "maxItems": 4,
                            "items": {"type": "string"},
                            "description": "4 first-person options (A–D) covering a range of personalities.",
                        },
                    },
                    "required": ["scenario", "options"],
                },
            }
        },
        "required": ["scenarios"],
    },
}

_BLUEPRINT_TOOL: anthropic.types.ToolParam = {
    "name": "extract_blueprint",
    "description": (
        "Extract a structured compatibility profile from a matrimony interview transcript. "
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
                "description": "Up to 3 core values the candidate holds.",
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

_DESCRIPTION_TOOL: anthropic.types.ToolParam = {
    "name": "generate_person_description",
    "description": (
        "Generate a warm, third-person natural language description of the candidate "
        "based on their interview answers. 3–4 sentences, dignified and human in tone."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "minLength": 50,
                "maxLength": 500,
                "description": "3–4 warm, third-person sentences describing the person's character, values, and what they seek in a partner.",
            }
        },
        "required": ["description"],
    },
}

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

def _scenarios_system(language: str) -> str:
    return (
        f"You are the AI Arbitrator for a zero-fraud matrimony platform serving Indian families. "
        f"Generate 6 completely fresh, unique situational scenarios for a compatibility interview. "
        f"All scenarios must be written in {language}. "
        f"Root each scenario in Indian family dynamics, cultural expectations, and modern pressures — "
        f"make them feel like real situations an Indian couple would face. "
        f"Every session must produce different scenarios — never reuse previous ones."
    )


def _blueprint_system(language: str) -> str:
    return (
        f"You are the AI Arbitrator for a zero-fraud matrimony platform. "
        f"Analyse the interview transcript and call the extract_blueprint tool "
        f"with the candidate's structured compatibility profile. "
        f"The interview was conducted in {language}. "
        f"Be precise and grounded in the transcript — do not invent information."
    )


def _description_system() -> str:
    return (
        "You are the AI Arbitrator for a zero-fraud matrimony platform. "
        "Based on the interview transcript, write a warm, dignified third-person description "
        "of the candidate — 3 to 4 sentences — capturing their personality, values, "
        "and what they seek in a life partner. Write in English."
    )


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

async def _generate_scenarios(language: str) -> list[dict]:
    response = await _ANTHROPIC_CLIENT.messages.create(
        model=_MODEL,
        max_tokens=4096,
        system=_scenarios_system(language),
        tools=[_SCENARIOS_TOOL],
        tool_choice={"type": "tool", "name": "generate_interview_scenarios"},
        messages=[{
            "role": "user",
            "content": (
                "Generate 6 fresh interview scenarios with 4 multiple-choice options each. "
                "Make them distinct from any prior session."
            ),
        }],
    )
    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_block is None:
        raise ValueError("Model did not return scenarios tool block.")
    scenarios: list[dict] = tool_block.input["scenarios"]
    if len(scenarios) != 6:
        raise ValueError(f"Expected 6 scenarios, got {len(scenarios)}.")
    return scenarios


async def _generate_blueprint(transcript: str, language: str) -> CompatibilityBlueprint:
    response = await _ANTHROPIC_CLIENT.messages.create(
        model=_MODEL,
        max_tokens=1024,
        system=_blueprint_system(language),
        tools=[_BLUEPRINT_TOOL],
        tool_choice={"type": "tool", "name": "extract_blueprint"},
        messages=[{"role": "user", "content": transcript}],
    )
    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_block is None:
        raise ValueError("Model did not return extract_blueprint tool block.")
    return CompatibilityBlueprint.model_validate(tool_block.input)


async def _generate_description(transcript: str) -> PersonDescription:
    response = await _ANTHROPIC_CLIENT.messages.create(
        model=_MODEL,
        max_tokens=512,
        system=_description_system(),
        tools=[_DESCRIPTION_TOOL],
        tool_choice={"type": "tool", "name": "generate_person_description"},
        messages=[{"role": "user", "content": transcript}],
    )
    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_block is None:
        raise ValueError("Model did not return generate_person_description tool block.")
    return PersonDescription.model_validate(tool_block.input)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_transcript(questions: list, answers: list[str]) -> str:
    return "\n".join(
        f"Q{i}: {q['scenario'] if isinstance(q, dict) else q}\nA{i}: {a}"
        for i, (q, a) in enumerate(zip(questions, answers), 1)
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/start/{lead_id}",
    response_model=InterviewSessionRead,
    summary="Start a new AI interview session for a lead",
)
async def start_interview(lead_id: int, db: DbSession) -> InterviewSession:
    lead = await db.scalar(select(Lead).where(Lead.id == lead_id))
    if lead is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead {lead_id} not found.",
        )

    scenarios = _MOCK_SCENARIOS if DEV_MODE else await _generate_scenarios(lead.language_preference)

    session = InterviewSession(
        lead_id=lead_id,
        questions=scenarios,
        answers=[],
        current_question_index=0,
        is_complete=False,
    )
    db.add(session)
    await db.flush()
    return session


@router.post(
    "/{session_id}/respond",
    response_model=RespondResult,
    summary="Submit an answer; Claude evaluates quality and advances or probes",
)
async def respond_to_question(
    session_id: int,
    payload: RespondRequest,
    db: DbSession,
) -> RespondResult:
    session = await db.scalar(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found.",
        )
    if session.is_complete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is already complete.",
        )

    idx = session.current_question_index
    new_answers: list[str] = list(session.answers or []) + [payload.answer]
    new_index = idx + 1
    is_done = new_index >= len(session.questions)

    session.answers = new_answers
    session.current_question_index = new_index
    session.is_complete = is_done

    # Commit immediately so the state is visible to the /complete request
    # that the frontend fires right after receiving is_complete=True.
    await db.commit()

    next_q = None if is_done else session.questions[new_index]

    return RespondResult(
        session=InterviewSessionRead.model_validate(session),
        next_question=next_q,
        is_complete=is_done,
    )


@router.post(
    "/{session_id}/complete",
    response_model=LeadRead,
    summary="Generate blueprint and description; mark lead interview complete",
)
async def complete_interview(session_id: int, db: DbSession) -> Lead:
    session = await db.scalar(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found.",
        )
    if not session.is_complete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not yet complete — all 6 questions must be answered first.",
        )

    lead = await db.scalar(select(Lead).where(Lead.id == session.lead_id))
    if lead is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found.",
        )

    if lead.ai_interview_completed:
        return lead

    if DEV_MODE:
        lead.compatibility_blueprint = _MOCK_BLUEPRINT
        lead.lead_description = _MOCK_BIO
    else:
        transcript = _build_transcript(session.questions, session.answers)
        blueprint, description = await asyncio.gather(
            _generate_blueprint(transcript, lead.language_preference),
            _generate_description(transcript),
        )
        lead.compatibility_blueprint = blueprint.model_dump()
        lead.lead_description = description.description

    lead.ai_interview_completed = True

    # Commit inside the handler so any DB error surfaces here (caught by
    # FastAPI's exception handler) rather than in the get_db teardown, which
    # runs after the response is streamed and is invisible to exception handlers.
    await db.commit()
    await db.refresh(lead)
    return lead
