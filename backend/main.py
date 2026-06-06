from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AXIOM Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    log = models.Log(
        timestamp=payload.timestamp,
        note=payload.note,
        cognitive_load=p.cognitive_load,
        physical_energy=p.physical_energy,
        mental_energy=p.mental_energy,
        autonomy=p.autonomy,
        entropy=p.entropy,
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
