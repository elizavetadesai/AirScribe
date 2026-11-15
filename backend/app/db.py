"""Database tables (SQLAlchemy 2). SQLite by default, Postgres via DATABASE_URL.

users            one row per account (patient or clinician)
attempts         one row per drawing attempt: target, prediction, scores,
                 the fingertip points (no video) and extra metrics as JSON
clinician_links  which clinician may read which patient's attempts
"""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (JSON, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, create_engine)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import DATABASE_URL

_connect = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # "patient" | "clinician"
    password_hash: Mapped[str] = mapped_column(String(300))
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    attempts: Mapped[list["Attempt"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Attempt(Base):
    __tablename__ = "attempts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    target: Mapped[str] = mapped_column(String(20))
    predicted: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float)
    accuracy_score: Mapped[float] = mapped_column(Float)
    smoothness_score: Mapped[float] = mapped_column(Float)
    points: Mapped[list] = mapped_column(JSON)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    user: Mapped[User] = relationship(back_populates="attempts")


class ClinicianLink(Base):
    __tablename__ = "clinician_links"
    __table_args__ = (UniqueConstraint("clinician_id", "patient_id"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    clinician_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CollectParticipant(Base):
    """Anonymous training-data participant. The public ID is P01, P02, ... from `num`."""
    __tablename__ = "collect_participants"
    num: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def pid(self) -> str:
        return f"P{self.num:02d}"


class CollectSample(Base):
    """One recorded drawing for the training dataset (fingertip coordinates only)."""
    __tablename__ = "collect_samples"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    participant_num: Mapped[int] = mapped_column(ForeignKey("collect_participants.num", ondelete="CASCADE"),
                                                 index=True)
    label: Mapped[str] = mapped_column(String(20))
    hand: Mapped[str] = mapped_column(String(10), default="unknown")
    note: Mapped[str] = mapped_column(String(60), default="")
    fps: Mapped[float | None] = mapped_column(Float, nullable=True)
    aspect: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_client: Mapped[str | None] = mapped_column(String(40), nullable=True)
    received: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    points: Mapped[list] = mapped_column(JSON)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
