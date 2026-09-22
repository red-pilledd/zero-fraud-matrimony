import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Boolean,
    Enum as SAEnum,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class IntentSilo(str, enum.Enum):
    MATRIMONY = "MATRIMONY"
    ALTERNATIVE = "ALTERNATIVE"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # SHA-256 hex digest of government ID — raw ID is never stored (Zero-Fraud directive)
    identity_hash = Column(String(64), unique=True, nullable=False, index=True)
    # native_enum=False: stores as VARCHAR + CHECK constraint on all backends.
    # SQLite has no native enum type; PostgreSQL would use one by default but
    # VARCHAR + CHECK is portable and still enforces the allowed values at the
    # DB layer. Switch to native_enum=True (and add create_type=True) when
    # deploying to a dedicated PostgreSQL instance with Alembic migrations.
    intent_silo = Column(SAEnum(IntentSilo, name="intent_silo_enum", native_enum=False), nullable=False)
    stake_balance = Column(Integer, nullable=False, default=0)
    reputation_score = Column(Integer, nullable=False, default=0)
    is_physically_verified = Column(Boolean, nullable=False, default=False)
    is_banned = Column(Boolean, nullable=False, default=False)
    compatibility_blueprint = Column(JSON, nullable=True)
    lead_description = Column(String(2000), nullable=True)
    profile_confidence = Column(
        SAEnum("HIGH", "MEDIUM", "LOW", name="profile_confidence_enum", native_enum=False),
        nullable=True,
    )

    # ── Basic Info ───────────────────────────────────────────────────────────
    age               = Column(Integer,      nullable=True)
    height_cm         = Column(Integer,      nullable=True)
    marital_status    = Column(String(50),   nullable=True)
    mother_tongue     = Column(String(50),   nullable=True)
    pref_age_min      = Column(Integer,      nullable=True)
    pref_age_max      = Column(Integer,      nullable=True)
    pref_height_min   = Column(Integer,      nullable=True)
    pref_height_max   = Column(Integer,      nullable=True)
    pref_marital_status = Column(JSON,       nullable=True)
    pref_mother_tongue  = Column(JSON,       nullable=True)

    # ── Religion & Community ─────────────────────────────────────────────────
    religion      = Column(String(50),  nullable=True)
    caste         = Column(String(100), nullable=True)
    subcaste      = Column(String(100), nullable=True)
    gothram       = Column(String(100), nullable=True)
    pref_religion = Column(JSON,        nullable=True)
    pref_caste    = Column(JSON,        nullable=True)

    # ── Location ─────────────────────────────────────────────────────────────
    nationality           = Column(String(50),  nullable=True)
    country_of_residence  = Column(String(50),  nullable=True)
    state                 = Column(String(50),  nullable=True)
    city                  = Column(String(100), nullable=True)
    pref_nationality      = Column(JSON,        nullable=True)
    pref_country          = Column(JSON,        nullable=True)
    pref_state            = Column(JSON,        nullable=True)

    # ── Career & Education ───────────────────────────────────────────────────
    education_level   = Column(String(50),  nullable=True)
    field_of_study    = Column(String(100), nullable=True)
    occupation        = Column(String(50),  nullable=True)
    annual_income     = Column(String(50),  nullable=True)
    pref_education_level = Column(String(50), nullable=True)
    pref_occupation   = Column(JSON,        nullable=True)
    pref_income_range = Column(String(50),  nullable=True)

    # ── Lifestyle ────────────────────────────────────────────────────────────
    diet                    = Column(String(50), nullable=True)
    drinking                = Column(String(50), nullable=True)
    smoking                 = Column(String(50), nullable=True)
    has_disability          = Column(Boolean,    nullable=True)
    pref_diet               = Column(JSON,       nullable=True)
    pref_drinking_acceptable = Column(String(50), nullable=True)
    pref_smoking_acceptable  = Column(String(50), nullable=True)
    pref_disability_acceptable = Column(String(50), nullable=True)

    # ── Bio ──────────────────────────────────────────────────────────────────
    manual_bio       = Column(String(300), nullable=True)
    bio_display_mode = Column(String(20),  nullable=True)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(20), unique=True, nullable=False, index=True)
    source = Column(String(255), nullable=False)
    language_preference = Column(String(50), nullable=False, default="english")
    ai_interview_completed = Column(Boolean, nullable=False, default=False)
    compatibility_blueprint = Column(JSON, nullable=True)
    lead_description = Column(String(2000), nullable=True)


class FlagSource(str, enum.Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"


class Flag(Base):
    __tablename__ = "flags"

    id = Column(Integer, primary_key=True, index=True)
    # null for SYSTEM-generated flags (no human flagger)
    flagger_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    flagged_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reason = Column(String(500), nullable=False)
    source = Column(SAEnum(FlagSource, name="flag_source_enum", native_enum=False), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    questions = Column(JSON, nullable=False, default=list)
    answers = Column(JSON, nullable=False, default=list)
    current_question_index = Column(Integer, nullable=False, default=0)
    is_complete = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class UserRelationship(Base):
    """Tracks per-sender message count and photo unlock status between two users."""
    __tablename__ = "user_relationships"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(String(50), nullable=False, index=True)
    partner_id = Column(String(50), nullable=False, index=True)
    message_count  = Column(Integer, nullable=False, default=0)
    photo_unlocked = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("user_id", "partner_id", name="uq_user_relationship"),
    )


class UserPhoto(Base):
    __tablename__ = "user_photos"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(String(50), nullable=False, index=True)
    filename   = Column(String(255), nullable=False)   # stored as UUID filename on disk
    is_primary = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"

    id          = Column(Integer, primary_key=True, index=True)
    # String IDs to match the dev socket layer ("lead-1", "user-bob", etc.)
    sender_id   = Column(String(50), nullable=False, index=True)
    receiver_id = Column(String(50), nullable=False, index=True)
    content     = Column(String(4000), nullable=False)
    timestamp   = Column(DateTime, nullable=False, default=datetime.utcnow)
    is_read     = Column(Boolean, nullable=False, default=False)
