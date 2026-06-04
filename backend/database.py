from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# SQLite はこの backend/ ディレクトリ内に隔離して配置する。
DB_PATH = Path(__file__).resolve().parent / "axiom.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False は SQLite を複数スレッドで扱う FastAPI 用設定。
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
