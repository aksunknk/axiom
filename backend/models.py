from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


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
