"""Training-data collection API used by the /collect page.

Participants never log in. The collect link carries a short team code
(?code=...), checked against COLLECT_CODE. The server hands out anonymous IDs
(P01, P02, ...) so two people can never end up with the same ID.

Each saved drawing is uploaded once; uploads are idempotent (the browser sends
a client_id per drawing, so retries never create duplicates).

The team exports everything with the admin key (COLLECT_ADMIN_KEY):
    curl -H "X-Admin-Key: <key>" https://<backend>/collect/export -o ml/recordings/server.json
and then runs ml/data_prep/own_recordings.py on that file as usual.
"""
from __future__ import annotations

import hmac
from collections import defaultdict

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import config
from .db import CollectParticipant, CollectSample, get_db, utcnow
from .schemas import CollectSampleIn, CollectSampleOut, CollectStartIn, CollectStartOut

from airscribe_ml.classes import CLASSES  # noqa: E402  (path set by app.inference)

router = APIRouter(prefix="/collect", tags=["data collection"])


def _check_code(code: str | None) -> None:
    if not config.COLLECT_CODE:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Data upload is not enabled on the server (COLLECT_CODE is not set).")
    if not code or not hmac.compare_digest(code.strip(), config.COLLECT_CODE):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong or missing collection code in the link.")


def _check_admin(header_key: str | None, query_key: str | None) -> None:
    key = header_key or query_key
    if not config.COLLECT_ADMIN_KEY:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "COLLECT_ADMIN_KEY is not set on the server.")
    if not key or not hmac.compare_digest(key, config.COLLECT_ADMIN_KEY):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong admin key.")


def _participant(db: Session, pid: str) -> CollectParticipant:
    try:
        num = int(pid[1:])
    except ValueError:
        num = -1
    p = db.get(CollectParticipant, num)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown participant {pid}. Reload the page to get a new ID.")
    return p


def _count(db: Session, num: int) -> int:
    return db.scalar(select(func.count(CollectSample.id)).where(CollectSample.participant_num == num)) or 0


@router.post("/participants", response_model=CollectStartOut, status_code=201)
def new_participant(body: CollectStartIn, db: Session = Depends(get_db)):
    _check_code(body.code)
    p = CollectParticipant(created=utcnow())
    db.add(p)
    db.commit()
    return CollectStartOut(participant_id=p.pid)


@router.post("/samples", response_model=CollectSampleOut)
def upload_sample(body: CollectSampleIn, db: Session = Depends(get_db)):
    _check_code(body.code)
    if body.label not in CLASSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown label '{body.label}'")
    p = _participant(db, body.participant_id)
    existing = db.scalar(select(CollectSample).where(CollectSample.client_id == body.client_id))
    if existing is None:  # retries of the same drawing are ignored
        db.add(CollectSample(client_id=body.client_id, participant_num=p.num, label=body.label, hand=body.hand,
                             note=body.note.strip(), fps=body.fps, aspect=body.aspect,
                             created_client=body.created, points=body.points))
        db.commit()
    elif existing.participant_num != p.num:
        raise HTTPException(status.HTTP_409_CONFLICT, "This drawing was already uploaded for another participant.")
    return CollectSampleOut(ok=True, participant_id=p.pid, count=_count(db, p.num))


@router.delete("/samples/{client_id}", status_code=204)
def delete_sample(client_id: str, participant_id: str = Query(...), code: str = Query(...),
                  db: Session = Depends(get_db)):
    """Used by "Undo last". Deleting something that is not there is not an error."""
    _check_code(code)
    p = _participant(db, participant_id)
    db.query(CollectSample).filter(CollectSample.client_id == client_id,
                                   CollectSample.participant_num == p.num).delete(synchronize_session=False)
    db.commit()


@router.get("/summary")
def summary(x_admin_key: str | None = Header(default=None), key: str | None = Query(default=None),
            db: Session = Depends(get_db)):
    """Participant x target counts. Open in a browser with ?key=<COLLECT_ADMIN_KEY>."""
    _check_admin(x_admin_key, key)
    rows = db.execute(select(CollectSample.participant_num, CollectSample.label, func.count(CollectSample.id))
                      .group_by(CollectSample.participant_num, CollectSample.label)).all()
    table: dict[str, dict[str, int]] = defaultdict(dict)
    for num, label, n in rows:
        table[f"P{num:02d}"][label] = n
    people = db.scalar(select(func.count(CollectParticipant.num))) or 0
    return {"participants_started": people, "participants_with_data": len(table),
            "samples": sum(sum(v.values()) for v in table.values()),
            "per_participant": {pid: {"total": sum(c.values()), **dict(sorted(c.items()))}
                                for pid, c in sorted(table.items())}}


@router.get("/export")
def export(x_admin_key: str | None = Header(default=None), key: str | None = Query(default=None),
           db: Session = Depends(get_db)):
    """All samples in the same format as the page's JSON download."""
    _check_admin(x_admin_key, key)
    out = []
    for s in db.scalars(select(CollectSample).order_by(CollectSample.participant_num, CollectSample.received)):
        out.append({"participant": f"P{s.participant_num:02d}", "label": s.label, "hand": s.hand, "note": s.note,
                    "fps": s.fps, "aspect": s.aspect, "created": s.created_client, "client_id": s.client_id,
                    "app": "airscribe-collect-server", "points": s.points})
    return out
