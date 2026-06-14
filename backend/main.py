import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, engine, get_db
from llm.router import router as llm_router
from llm.tasks import QUEUED
from llm_client import get_llm_client

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)


def migrate_schema() -> None:
    """既存 DB に logs.enrichment 列を追加する（冪等）。"""
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    "ALTER TABLE logs ADD COLUMN enrichment TEXT NOT NULL DEFAULT '{}'"
                )
            )
            conn.commit()
        except OperationalError:
            conn.rollback()


migrate_schema()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await get_llm_client().aclose()


app = FastAPI(title="AXIOM Backend", version="1.0.0", lifespan=lifespan)
app.include_router(llm_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_enrichment(raw: str | None) -> schemas.EnrichmentState:
    if not raw or raw == "{}":
        return schemas.EnrichmentState(status="idle")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return schemas.EnrichmentState(status="failed")
    if not isinstance(data, dict):
        return schemas.EnrichmentState(status="failed")
    status = data.get("status", "pending")
    payload = data.get("data")
    enrichment_data = None
    if isinstance(payload, dict) and status == "done":
        try:
            enrichment_data = schemas.EnrichmentData.model_validate(payload)
        except Exception:
            status = "failed"
    return schemas.EnrichmentState(status=status, data=enrichment_data)


def event_to_read(event: models.Event) -> schemas.EventRead:
    return schemas.EventRead(
        id=event.id,
        timestamp=event.timestamp,
        kind=event.kind,
        payload=json.loads(event.payload) if event.payload else {},
    )


def log_to_read(log: models.Log) -> schemas.LogRead:
    return schemas.LogRead(
        id=log.id,
        timestamp=log.timestamp,
        note=log.note,
        params=schemas.ParamsSchema(
            cognitive_load=log.cognitive_load,
            physical_energy=log.physical_energy,
            mental_energy=log.mental_energy,
            autonomy=log.autonomy,
            entropy=log.entropy,
        ),
        enrichment=parse_enrichment(log.enrichment),
    )




@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/logs", response_model=schemas.LogRead, status_code=201)
def create_log(
    payload: schemas.LogCreate,
    db: Session = Depends(get_db),
) -> schemas.LogRead:
    p = payload.params
    note = payload.note.strip()
    enrichment_json = (
        json.dumps(QUEUED, ensure_ascii=False) if note else json.dumps({}, ensure_ascii=False)
    )
    log = models.Log(
        timestamp=payload.timestamp,
        note=payload.note,
        cognitive_load=p.cognitive_load,
        physical_energy=p.physical_energy,
        mental_energy=p.mental_energy,
        autonomy=p.autonomy,
        entropy=p.entropy,
        enrichment=enrichment_json,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log_to_read(log)


@app.get("/api/logs", response_model=list[schemas.LogRead])
def list_logs(
    days: int | None = None,
    db: Session = Depends(get_db),
) -> list[schemas.LogRead]:
    query = db.query(models.Log).order_by(models.Log.timestamp.asc())
    if days is not None:
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        query = query.filter(models.Log.timestamp >= since)
    logs = query.all()
    return [log_to_read(log) for log in logs]


@app.post("/api/events", response_model=schemas.EventRead, status_code=201)
def create_event(
    payload: schemas.EventCreate,
    db: Session = Depends(get_db),
) -> schemas.EventRead:
    event_payload = dict(payload.payload)
    note = event_payload.get("note")
    if (
        payload.kind == "nottodo_purge"
        and isinstance(note, str)
        and note.strip()
    ):
        event_payload["llm"] = QUEUED

    event = models.Event(
        timestamp=payload.timestamp,
        kind=payload.kind,
        payload=json.dumps(event_payload, ensure_ascii=False),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_to_read(event)


@app.get("/api/events", response_model=list[schemas.EventRead])
def list_events(
    kind: str | None = None,
    days: int | None = None,
    db: Session = Depends(get_db),
) -> list[schemas.EventRead]:
    query = db.query(models.Event).order_by(models.Event.timestamp.asc())
    if kind is not None:
        query = query.filter(models.Event.kind == kind)
    if days is not None:
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        query = query.filter(models.Event.timestamp >= since)
    events = query.all()
    return [event_to_read(e) for e in events]


@app.get("/api/events/count")
def count_events(
    kind: str = Query(..., min_length=1),
    days: int = Query(1, ge=1),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    count = (
        db.query(func.count(models.Event.id))
        .filter(models.Event.kind == kind, models.Event.timestamp >= since)
        .scalar()
    )
    return {"count": count or 0}
