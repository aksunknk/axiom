from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Event(Base):
    """離散イベント（Safe Mode切替、Not-To-Doパージ等）の汎用記録。"""

    __tablename__ = "events"
    __table_args__ = (Index("ix_events_kind_timestamp", "kind", "timestamp"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cognitive_load: Mapped[int] = mapped_column(Integer, nullable=False)
    physical_energy: Mapped[int] = mapped_column(Integer, nullable=False)
    mental_energy: Mapped[int] = mapped_column(Integer, nullable=False)
    autonomy: Mapped[int] = mapped_column(Integer, nullable=False)
    entropy: Mapped[int] = mapped_column(Integer, nullable=False)
    enrichment: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
