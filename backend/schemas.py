from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StatusLogBase(BaseModel):
    timestamp: datetime
    trigger_action: str
    cognitive_load: int = Field(ge=0, le=100)
    physical_energy: int = Field(ge=0, le=100)
    mental_energy: int = Field(ge=0, le=100)
    autonomy: int = Field(ge=0, le=100)
    entropy: int = Field(ge=0, le=100)
    system_integrity: float = Field(ge=0, le=100)


class StatusLogCreate(StatusLogBase):
    pass


class StatusLogRead(StatusLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
