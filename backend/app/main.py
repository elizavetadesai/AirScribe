"""AirScribe API.

Run locally (from backend/):  uvicorn app.main:app --reload --port 8000
Interactive docs:             http://localhost:8000/docs
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import config
from .db import Attempt, ClinicianLink, User, get_db, init_db
from .inference import load_predictor
from .schemas import (HistoryItem, LinkIn, LoginIn, PatientOut, PredictIn, PredictOut, RegisterIn,
                      TokenOut)
from .security import create_token, current_user, hash_password, require_clinician, verify_password

from airscribe_ml.classes import DISPLAY_NAMES, LEVEL, TARGETS  # noqa: E402  (path set by inference)
from airscribe_ml.preprocess import TrajectoryError  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("airscribe")
STATE: dict = {"predictor": None, "model_error": None}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    STATE["predictor"], STATE["model_error"] = load_predictor(config.MODEL_DIR)
    if STATE["model_error"]:
        log.warning(STATE["model_error"])
    yield


app = FastAPI(title="AirScribe API", version="0.2.0", lifespan=lifespan,
              description="Air-drawing recognition and movement scoring for home stroke rehabilitation. "
                          "Rehabilitation support tool, not a medical device.")


@app.middleware("http")
async def timing_and_errors(request: Request, call_next):
    """Times every request and turns crashes into a JSON 500 with the full
    traceback in the server log. Registered BEFORE CORS so CORS wraps it:
    error responses then still carry CORS headers and the browser shows
    "Server error" instead of a misleading "Could not reach the server"."""
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - t0) * 1000:.1f}"
    return response


# Added last = outermost layer, so it also covers the 500 responses above.
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_origin_regex=config.CORS_ORIGIN_REGEX, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
log.info("CORS allowed origins: %s", config.CORS_ORIGINS)


# ----------------------------------------------------------------------------- helpers
def _iso(d) -> str:
    return d.isoformat() if d.tzinfo else d.isoformat() + "Z"


def _history_item(a: Attempt) -> HistoryItem:
    return HistoryItem(session_id=a.id, created=_iso(a.created), target_letter=a.target,
                       predicted_letter=a.predicted, confidence=a.confidence,
                       accuracy_score=a.accuracy_score, smoothness_score=a.smoothness_score, points=a.points)


def _attempts(db: Session, user_id: str, limit: int) -> list[HistoryItem]:
    rows = db.scalars(select(Attempt).where(Attempt.user_id == user_id)
                      .order_by(Attempt.created.desc()).limit(limit))
    return [_history_item(a) for a in rows]


# ----------------------------------------------------------------------------- info
@app.get("/")
@app.get("/health")
def health():
    p = STATE["predictor"]
    return {"status": "ok", "model_loaded": p is not None, "model": p.info if p else None,
            "model_error": STATE["model_error"]}


@app.get("/targets")
def targets():
    return [{"id": t, "name": DISPLAY_NAMES[t], "level": LEVEL[t]} for t in TARGETS]


# ----------------------------------------------------------------------------- auth
@app.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    user = User(email=email, name=(body.name or email.split("@")[0]).strip(), role=body.role,
                password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from None
    return TokenOut(token=create_token(user), role=user.role, name=user.name)


@app.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(token=create_token(user), role=user.role, name=user.name)


@app.get("/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@app.delete("/auth/me", status_code=204)
def delete_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(ClinicianLink).filter((ClinicianLink.patient_id == user.id) |
                                   (ClinicianLink.clinician_id == user.id)).delete(synchronize_session=False)
    db.query(Attempt).filter(Attempt.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()


# ----------------------------------------------------------------------------- practice
@app.post("/predict", response_model=PredictOut)
def predict(body: PredictIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    predictor = STATE["predictor"]
    if predictor is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "The recognition model is not loaded on the server yet.")
    if body.target_letter not in TARGETS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"Unknown target '{body.target_letter}'. Valid: {', '.join(TARGETS)}")
    try:
        result = predictor.predict(body.target_letter, body.points, body.frame_aspect)
    except TrajectoryError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not use this attempt: {e}") from None

    attempt = Attempt(user_id=user.id, target=body.target_letter, predicted=result["letter"],
                      confidence=result["confidence"], accuracy_score=result["accuracy_score"],
                      smoothness_score=result["smoothness_score"], points=body.points,
                      details={k: result[k] for k in ("probabilities", "shape_similarity", "sparc", "ldlj",
                                                      "speed_peaks", "duration_s", "timing_ms")}
                      | {"frame_aspect": body.frame_aspect})
    db.add(attempt)
    db.commit()
    log.info("predict user=%s target=%s pred=%s conf=%.2f total=%.1fms", user.id, body.target_letter,
             result["letter"], result["confidence"], result["timing_ms"]["total"])
    return PredictOut(session_id=attempt.id, **result)


@app.get("/history", response_model=list[HistoryItem])
def history(limit: int = Query(50, ge=1, le=500), user: User = Depends(current_user),
            db: Session = Depends(get_db)):
    return _attempts(db, user.id, limit)


# ----------------------------------------------------------------------------- clinician
def _linked_patient(db: Session, clinician: User, patient_id: str) -> User:
    link = db.scalar(select(ClinicianLink).where(ClinicianLink.clinician_id == clinician.id,
                                                 ClinicianLink.patient_id == patient_id))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found in your list")
    return db.get(User, patient_id)


@app.get("/clinician/patients", response_model=list[PatientOut])
def patients(clinician: User = Depends(require_clinician), db: Session = Depends(get_db)):
    stats = (select(User, func.count(Attempt.id), func.max(Attempt.created))
             .join(ClinicianLink, ClinicianLink.patient_id == User.id)
             .outerjoin(Attempt, Attempt.user_id == User.id)
             .where(ClinicianLink.clinician_id == clinician.id)
             .group_by(User.id).order_by(User.name))
    return [PatientOut(id=u.id, name=u.name, email=u.email, sessions_total=n,
                       last_active=_iso(last) if last else None)
            for u, n, last in db.execute(stats).all()]


@app.post("/clinician/patients", response_model=PatientOut, status_code=201)
def link_patient(body: LinkIn, clinician: User = Depends(require_clinician), db: Session = Depends(get_db)):
    patient = db.scalar(select(User).where(User.email == body.email.lower()))
    if patient is None or patient.role != "patient":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No patient account with that email")
    exists = db.scalar(select(ClinicianLink).where(ClinicianLink.clinician_id == clinician.id,
                                                   ClinicianLink.patient_id == patient.id))
    if exists is None:
        db.add(ClinicianLink(clinician_id=clinician.id, patient_id=patient.id))
        db.commit()
    n, last = db.execute(select(func.count(Attempt.id), func.max(Attempt.created))
                         .where(Attempt.user_id == patient.id)).one()
    return PatientOut(id=patient.id, name=patient.name, email=patient.email, sessions_total=n,
                      last_active=_iso(last) if last else None)


@app.delete("/clinician/patients/{patient_id}", status_code=204)
def unlink_patient(patient_id: str, clinician: User = Depends(require_clinician), db: Session = Depends(get_db)):
    _linked_patient(db, clinician, patient_id)
    db.query(ClinicianLink).filter(ClinicianLink.clinician_id == clinician.id,
                                   ClinicianLink.patient_id == patient_id).delete(synchronize_session=False)
    db.commit()


@app.get("/clinician/patients/{patient_id}/history", response_model=list[HistoryItem])
def patient_history(patient_id: str, limit: int = Query(200, ge=1, le=1000),
                    clinician: User = Depends(require_clinician), db: Session = Depends(get_db)):
    _linked_patient(db, clinician, patient_id)
    return _attempts(db, patient_id, limit)
