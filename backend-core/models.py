import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Enum as SAEnum,
    JSON,
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
    intent_silo = Column(SAEnum(IntentSilo, name="intent_silo_enum"), nullable=False)
    stake_balance = Column(Integer, nullable=False, default=0)
    reputation_score = Column(Integer, nullable=False, default=0)
    is_physically_verified = Column(Boolean, nullable=False, default=False)


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(20), unique=True, nullable=False, index=True)
    source = Column(String(255), nullable=False)
    ai_interview_completed = Column(Boolean, nullable=False, default=False)
    compatibility_blueprint = Column(JSON, nullable=True)
