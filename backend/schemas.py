import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class EventCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime


class EventRead(BaseModel):
    id: int
    timestamp: datetime
    kind: str
    payload: dict[str, Any]

    @field_validator("payload", mode="before")
    @classmethod
    def parse_payload(cls, v: Any) -> dict[str, Any]:
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            return json.loads(v) if v else {}
        return {}
