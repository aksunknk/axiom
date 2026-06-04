from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class StatusLog(Base):
    __tablename__ = "status_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    trigger_action: Mapped[str] = mapped_column(String, nullable=False)
    cognitive_load: Mapped[int] = mapped_column(Integer, nullable=False)
    physical_energy: Mapped[int] = mapped_column(Integer, nullable=False)
    mental_energy: Mapped[int] = mapped_column(Integer, nullable=False)
    autonomy: Mapped[int] = mapped_column(Integer, nullable=False)
    entropy: Mapped[int] = mapped_column(Integer, nullable=False)
    system_integrity: Mapped[float] = mapped_column(Float, nullable=False)
