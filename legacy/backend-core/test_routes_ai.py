import os

# Must be set before any app module is imported so database.py and routes_ai.py
# can resolve their env vars at import time without hitting a real server.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-real")

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from database import get_db
from main import app
from models import Base, Lead
from schemas_ai import CompatibilityBlueprint, FamilyStructurePreference

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

VALID_BLUEPRINT = CompatibilityBlueprint(
    financial_expectation="Seeks a partner with stable income and shared saving habits.",
    family_structure_preference=FamilyStructurePreference.FLEXIBLE,
    career_priority=7,
    core_values=["Integrity", "Family", "Ambition"],
    non_negotiables=["No substance abuse"],
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def test_engine():
    """In-memory SQLite engine shared across all sessions within one test."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # single connection → all sessions see same DB
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture()
async def client(test_engine):
    """
    AsyncClient wired to the FastAPI app with:
      - get_db overridden to use the test engine
      - init_db patched to a no-op (table creation is handled by test_engine fixture)
    """
    TestSession = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async def override_get_db():
        async with TestSession() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    with patch("main.init_db", new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as ac:
            yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def seeded_lead(test_engine) -> Lead:
    """Insert one Lead row and return it with its auto-assigned id."""
    TestSession = async_sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with TestSession() as session:
        lead = Lead(
            phone_number="+919876543210",
            source="ward-14-manual",
            ai_interview_completed=False,
        )
        session.add(lead)
        await session.commit()
        await session.refresh(lead)
        return lead


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGenerateBlueprint:
    async def test_success_persists_blueprint(self, client, seeded_lead):
        """Happy path: valid lead + mocked LLM → 200, blueprint written to lead."""
        with patch(
            "routes_ai.extract_blueprint_from_llm",
            new_callable=AsyncMock,
            return_value=VALID_BLUEPRINT,
        ):
            response = await client.post(
                f"/leads/{seeded_lead.id}/generate-blueprint",
                json={"transcript": "I value family above all else and want a stable home."},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == seeded_lead.id
        assert body["ai_interview_completed"] is True
        bp = body["compatibility_blueprint"]
        assert bp["career_priority"] == 7
        assert bp["family_structure_preference"] == "FLEXIBLE"
        assert bp["core_values"] == ["Integrity", "Family", "Ambition"]
        assert bp["non_negotiables"] == ["No substance abuse"]

    async def test_lead_not_found_returns_404(self, client):
        """Requesting a non-existent lead_id must return 404."""
        with patch(
            "routes_ai.extract_blueprint_from_llm",
            new_callable=AsyncMock,
            return_value=VALID_BLUEPRINT,
        ):
            response = await client.post(
                "/leads/99999/generate-blueprint",
                json={"transcript": "Some transcript."},
            )

        assert response.status_code == 404
        assert "99999" in response.json()["detail"]

    async def test_llm_failure_propagates_as_500(self, client, seeded_lead):
        """If the LLM helper raises, the endpoint must surface a 500."""
        with patch(
            "routes_ai.extract_blueprint_from_llm",
            new_callable=AsyncMock,
            side_effect=ValueError("Model did not return a tool_use block"),
        ):
            response = await client.post(
                f"/leads/{seeded_lead.id}/generate-blueprint",
                json={"transcript": "Some transcript."},
            )

        assert response.status_code == 500

    async def test_empty_transcript_rejected_before_llm(self, client, seeded_lead):
        """Pydantic min_length=1 on TranscriptRequest must reject empty strings (422)."""
        with patch(
            "routes_ai.extract_blueprint_from_llm",
            new_callable=AsyncMock,
            return_value=VALID_BLUEPRINT,
        ) as mock_llm:
            response = await client.post(
                f"/leads/{seeded_lead.id}/generate-blueprint",
                json={"transcript": ""},
            )
            mock_llm.assert_not_called()

        assert response.status_code == 422

    async def test_llm_called_with_exact_transcript(self, client, seeded_lead):
        """The transcript string from the request body must reach the LLM helper unchanged."""
        transcript = "Honesty and ambition matter most to me."
        with patch(
            "routes_ai.extract_blueprint_from_llm",
            new_callable=AsyncMock,
            return_value=VALID_BLUEPRINT,
        ) as mock_llm:
            await client.post(
                f"/leads/{seeded_lead.id}/generate-blueprint",
                json={"transcript": transcript},
            )
            mock_llm.assert_awaited_once_with(transcript)
