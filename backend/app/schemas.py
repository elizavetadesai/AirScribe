"""Request/response shapes. Field names match the frontend (src/api/endpoints.js)."""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from .config import MAX_POINTS


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["patient", "clinician"]
    name: str | None = Field(default=None, max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class TokenOut(BaseModel):
    token: str
    role: str
    name: str


class PredictIn(BaseModel):
    target_letter: str = Field(description="target id, e.g. 'circle' or 'L'")
    points: list[list[float]] = Field(description="[[x, y, t_ms], ...] raw MediaPipe coords, not mirrored")
    frame_aspect: float | None = Field(default=None, ge=0.3, le=4.0,
                                       description="video width / height; 16/9 if missing")

    @field_validator("points")
    @classmethod
    def _check_points(cls, v):
        if len(v) > MAX_POINTS:
            raise ValueError(f"at most {MAX_POINTS} points")
        for p in v:
            if len(p) not in (2, 3) or not all(math.isfinite(c) for c in p):
                raise ValueError("each point must be [x, y, t] with finite numbers")
            if not (-0.5 <= p[0] <= 1.5 and -0.5 <= p[1] <= 1.5):
                raise ValueError("x and y must be normalised (0-1) camera coordinates")
        return v


class PredictOut(BaseModel):
    letter: str
    confidence: float
    accuracy_score: float
    smoothness_score: float
    session_id: str
    predicted_name: str
    target_probability: float
    shape_similarity: float
    probabilities: dict[str, float]
    sparc: float
    ldlj: float
    speed_peaks: int
    duration_s: float
    timing_ms: dict[str, float]


class HistoryItem(BaseModel):
    session_id: str
    created: str
    target_letter: str
    predicted_letter: str
    confidence: float
    accuracy_score: float
    smoothness_score: float
    points: list[list[float]]


class PatientOut(BaseModel):
    id: str
    name: str
    email: str
    sessions_total: int
    last_active: str | None


class LinkIn(BaseModel):
    email: EmailStr
