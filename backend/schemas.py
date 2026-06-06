from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParamsSchema(BaseModel):
    cognitive_load: int = Field(ge=0, le=100)
    physical_energy: int = Field(ge=0, le=100)
    mental_energy: int = Field(ge=0, le=100)
    autonomy: int = Field(ge=0, le=100)
    entropy: int = Field(ge=0, le=100)


class LogCreate(BaseModel):
    params: ParamsSchema
    note: str
    timestamp: datetime


class LogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    note: str
    params: ParamsSchema
