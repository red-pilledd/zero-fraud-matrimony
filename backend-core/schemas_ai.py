import enum
from pydantic import BaseModel, Field
from typing import Annotated


class FamilyStructurePreference(str, enum.Enum):
    JOINT = "JOINT"
    NUCLEAR = "NUCLEAR"
    FLEXIBLE = "FLEXIBLE"


CareerPriority = Annotated[int, Field(ge=1, le=10)]
CoreValues = Annotated[list[str], Field(max_length=3, min_length=1)]
NonNegotiables = Annotated[list[str], Field(min_length=1)]


class CompatibilityBlueprint(BaseModel):
    """
    Canonical output schema for the AI Arbitrator.
    Every AI-generated blueprint must validate against this model before
    being written to the database.
    """

    financial_expectation: str = Field(
        ...,
        min_length=1,
        max_length=500,
    )
    family_structure_preference: FamilyStructurePreference
    career_priority: CareerPriority
    core_values: CoreValues
    non_negotiables: NonNegotiables

    model_config = {
        "use_enum_values": True,
        "str_strip_whitespace": True,
        "frozen": True,
    }
