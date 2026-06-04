from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, engine, get_db

# 起動時にテーブルを生成（存在しなければ）。
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AXIOM Backend", version="1.0.0")

# フロントエンド（Tauri/React dev・本番WebView）からのリクエストを許可。
# Tauri は tauri://localhost、Vite dev は http://localhost:5173 等。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/logs", response_model=schemas.StatusLogRead, status_code=201)
def create_log(
    payload: schemas.StatusLogCreate,
    db: Session = Depends(get_db),
) -> models.StatusLog:
    log = models.StatusLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@app.get("/api/logs", response_model=list[schemas.StatusLogRead])
def list_logs(db: Session = Depends(get_db)) -> list[models.StatusLog]:
    return db.query(models.StatusLog).order_by(models.StatusLog.id.desc()).all()
