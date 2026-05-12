from typing import Any
from pydantic import BaseModel, Field, field_validator
from models import IntentSilo


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

class UserBase(BaseModel):
    identity_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="SHA-256 hex digest of government ID",
    )
    intent_silo: IntentSilo
    stake_balance: int = Field(default=0, ge=0)
    reputation_score: int = Field(default=0, ge=0)
    is_physically_verified: bool = False


class UserCreate(UserBase):
    pass


class UserRead(UserBase):
    id: int

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    stake_balance: int | None = Field(default=None, ge=0)
    reputation_score: int | None = Field(default=None, ge=0)
    is_physically_verified: bool | None = None


# ---------------------------------------------------------------------------
# Lead schemas
# ---------------------------------------------------------------------------

class LeadBase(BaseModel):
    phone_number: str = Field(
        ...,
        min_length=7,
        max_length=20,
        pattern=r"^\+?[0-9\s\-]{7,20}$",
    )
    source: str = Field(..., min_length=1, max_length=255)
    ai_interview_completed: bool = False
    compatibility_blueprint: dict[str, Any] | None = None


class LeadCreate(LeadBase):
    pass


class LeadRead(LeadBase):
    id: int

    model_config = {"from_attributes": True}


class LeadUpdate(BaseModel):
    ai_interview_completed: bool | None = None
    compatibility_blueprint: dict[str, Any] | None = None


class LeadPromoteRequest(BaseModel):
    raw_id_string: str = Field(
        ...,
        min_length=1,
        max_length=256,
        description="Raw Aadhaar string — hashed server-side; never stored as-is",
    )
    intent_silo: IntentSilo
