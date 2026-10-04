from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, field_validator
from models import IntentSilo, FlagSource


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
    is_banned: bool = False
    compatibility_blueprint: dict[str, Any] | None = None
    lead_description: str | None = None
    profile_confidence: str | None = None  # HIGH | MEDIUM | LOW | None (not yet analyzed)


class UserCreate(UserBase):
    pass


class UserRead(UserBase):
    id: int

    # Profile fields — all optional, populated after the user edits their profile
    age:               int | None = None
    height_cm:         int | None = None
    marital_status:    str | None = None
    mother_tongue:     str | None = None
    pref_age_min:      int | None = None
    pref_age_max:      int | None = None
    pref_height_min:   int | None = None
    pref_height_max:   int | None = None
    pref_marital_status:  list[str] | None = None
    pref_mother_tongue:   list[str] | None = None

    religion:     str | None = None
    caste:        str | None = None
    subcaste:     str | None = None
    gothram:      str | None = None
    pref_religion: list[str] | None = None
    pref_caste:    list[str] | None = None

    nationality:          str | None = None
    country_of_residence: str | None = None
    state:                str | None = None
    city:                 str | None = None
    pref_nationality:     list[str] | None = None
    pref_country:         list[str] | None = None
    pref_state:           list[str] | None = None

    education_level:      str | None = None
    field_of_study:       str | None = None
    occupation:           str | None = None
    annual_income:        str | None = None
    pref_education_level: str | None = None
    pref_occupation:      list[str] | None = None
    pref_income_range:    str | None = None

    diet:                      str | None = None
    drinking:                  str | None = None
    smoking:                   str | None = None
    has_disability:            bool | None = None
    pref_diet:                 list[str] | None = None
    pref_drinking_acceptable:  str | None = None
    pref_smoking_acceptable:   str | None = None
    pref_disability_acceptable: str | None = None

    manual_bio:       str | None = None
    bio_display_mode: str | None = None

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
    language_preference: str = Field(default="english", min_length=1, max_length=50)
    ai_interview_completed: bool = False
    compatibility_blueprint: dict[str, Any] | None = None
    lead_description: str | None = None


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


# ---------------------------------------------------------------------------
# InterviewSession schemas
# ---------------------------------------------------------------------------

class InterviewSessionRead(BaseModel):
    id: int
    lead_id: int
    questions: list[Any]   # list of {scenario: str, options: list[str]}
    answers: list[str]
    current_question_index: int
    is_complete: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RespondRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=5000)


class RespondResult(BaseModel):
    session: InterviewSessionRead
    next_question: Any | None = None   # {scenario, options} or null
    is_complete: bool


# ---------------------------------------------------------------------------
# Profile update schema
# ---------------------------------------------------------------------------

class ProfileUpdate(BaseModel):
    """All fields optional — only provided fields are written to the database."""

    age:               int | None = Field(default=None, ge=18, le=100)
    height_cm:         int | None = Field(default=None, ge=100, le=250)
    marital_status:    str | None = Field(default=None, max_length=50)
    mother_tongue:     str | None = Field(default=None, max_length=50)
    pref_age_min:      int | None = Field(default=None, ge=18, le=100)
    pref_age_max:      int | None = Field(default=None, ge=18, le=100)
    pref_height_min:   int | None = Field(default=None, ge=100, le=250)
    pref_height_max:   int | None = Field(default=None, ge=100, le=250)
    pref_marital_status:  list[str] | None = None
    pref_mother_tongue:   list[str] | None = None

    religion:     str | None = Field(default=None, max_length=50)
    caste:        str | None = Field(default=None, max_length=100)
    subcaste:     str | None = Field(default=None, max_length=100)
    gothram:      str | None = Field(default=None, max_length=100)
    pref_religion: list[str] | None = None
    pref_caste:    list[str] | None = None

    nationality:          str | None = Field(default=None, max_length=50)
    country_of_residence: str | None = Field(default=None, max_length=50)
    state:                str | None = Field(default=None, max_length=50)
    city:                 str | None = Field(default=None, max_length=100)
    pref_nationality:     list[str] | None = None
    pref_country:         list[str] | None = None
    pref_state:           list[str] | None = None

    education_level:      str | None = Field(default=None, max_length=50)
    field_of_study:       str | None = Field(default=None, max_length=100)
    occupation:           str | None = Field(default=None, max_length=50)
    annual_income:        str | None = Field(default=None, max_length=50)
    pref_education_level: str | None = Field(default=None, max_length=50)
    pref_occupation:      list[str] | None = None
    pref_income_range:    str | None = Field(default=None, max_length=50)

    diet:                      str | None = Field(default=None, max_length=50)
    drinking:                  str | None = Field(default=None, max_length=50)
    smoking:                   str | None = Field(default=None, max_length=50)
    has_disability:            bool | None = None
    pref_diet:                 list[str] | None = None
    pref_drinking_acceptable:  str | None = Field(default=None, max_length=50)
    pref_smoking_acceptable:   str | None = Field(default=None, max_length=50)
    pref_disability_acceptable: str | None = Field(default=None, max_length=50)

    manual_bio:       str | None = Field(default=None, max_length=300)
    bio_display_mode: str | None = Field(default=None, max_length=20)


# ---------------------------------------------------------------------------
# Photo schemas
# ---------------------------------------------------------------------------

class PhotoRead(BaseModel):
    id: int
    user_id: str
    filename: str
    is_primary: bool
    sort_order: int
    url: str        # absolute URL constructed by the route handler
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Message schemas
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class MessageRead(BaseModel):
    id: int
    sender_id: str
    receiver_id: str
    content: str
    timestamp: datetime
    is_read: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Relationship schemas
# ---------------------------------------------------------------------------

class RelationshipRead(BaseModel):
    user_id:        str
    partner_id:     str
    message_count:  int
    photo_unlocked: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Flag schemas
# ---------------------------------------------------------------------------

class FlagCreate(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class FlagRead(BaseModel):
    id: int
    flagger_user_id: int | None
    flagged_user_id: int
    reason: str
    source: FlagSource
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Discovery feed schema — slim card view for browsing profiles
# ---------------------------------------------------------------------------

class DiscoverUserRead(BaseModel):
    """Slim read schema returned by GET /users/discover.

    Contains only the fields needed to render a discovery card.
    The full UserRead (with all preference fields) is only returned
    when viewing a specific profile.
    """
    id: int
    age: int | None = None
    height_cm: int | None = None
    religion: str | None = None
    mother_tongue: str | None = None
    nationality: str | None = None
    country_of_residence: str | None = None
    state: str | None = None
    city: str | None = None
    education_level: str | None = None
    occupation: str | None = None
    annual_income: str | None = None
    lead_description: str | None = None      # AI-generated bio from interview
    profile_confidence: str | None = None    # HIGH | MEDIUM | LOW | None
    primary_photo_url: str | None = None     # absolute URL, null if no photos uploaded
    is_physically_verified: bool = False

    model_config = {"from_attributes": True}
