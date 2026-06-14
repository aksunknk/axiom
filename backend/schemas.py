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


class EnrichmentData(BaseModel):
    trigger: str
    category: str
    impact: list[str] = Field(default_factory=list)


class EnrichmentState(BaseModel):
    status: str = "pending"
    data: EnrichmentData | None = None


class LogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    note: str
    params: ParamsSchema
    enrichment: EnrichmentState = Field(default_factory=EnrichmentState)


class SafeModeRationaleRequest(BaseModel):
    params: ParamsSchema
    integrity: int | None = Field(default=None, ge=0, le=100)
    integrity_delta: int | None = Field(default=None, ge=-100, le=100)
    diagnosis: str | None = Field(default=None, max_length=200)


class SafeModeRationaleResponse(BaseModel):
    rationale: str | None = None


class LLMPingResponse(BaseModel):
    status: str
    model: str | None = None
    latency_ms: float | None = None
    detail: str | None = None


class EnrichQueueResponse(BaseModel):
    count: int


class EnrichBatchResponse(BaseModel):
    queued_before: int
    processed: int
    done: int
    requeued: int


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
