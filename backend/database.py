import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _resolve_db_path() -> Path:
    """MSIインストール先(Program Files)でも書き込み可能なパスを使用する。"""
    appdata = os.environ.get("APPDATA")
    if appdata:
        db_dir = Path(appdata) / "AXIOM"
        db_dir.mkdir(parents=True, exist_ok=True)
        return db_dir / "axiom.db"
    return Path(__file__).resolve().parent / "axiom.db"


DB_PATH = _resolve_db_path()
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
