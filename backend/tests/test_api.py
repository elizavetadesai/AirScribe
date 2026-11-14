"""API tests. Run from backend/:  pytest -q

Uses a temporary SQLite database and a stand-in model (always predicts
"circle"), so they run without a trained model. Covers the exact request and
response fields the frontend uses.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long"
os.environ["MODEL_DIR"] = _tmp  # empty: no real model
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from app.inference import Predictor  # noqa: E402
from airscribe_ml.classes import CLASSES  # noqa: E402
from airscribe_ml.synthetic import synth_trajectory  # noqa: E402


class _Inp:
    def __init__(self, name):
        self.name = name


class FakeSession:
    def get_inputs(self):
        return [_Inp("image"), _Inp("sequence")]

    def run(self, _, feeds):
        logits = np.full(len(CLASSES), -2.0)
        logits[CLASSES.index("circle")] = 2.0
        return [logits[None]]


def webcam_points(cls="circle", seed=0):
    a = synth_trajectory(cls, np.random.default_rng(seed), "clean")
    return [[float(1 - x / (16 / 9)), float(y), float(t)] for x, y, t in a]


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        assert c.get("/health").json()["model_loaded"] is False
        main.STATE["predictor"] = Predictor(Path(_tmp), session=FakeSession(), meta={})
        yield c


def _register(client, email, role="patient"):
    r = client.post("/auth/register", json={"email": email, "password": "password123", "role": role})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_register_login(client):
    _register(client, "pat@example.com")
    r = client.post("/auth/login", json={"email": "PAT@example.com", "password": "password123"})
    assert r.status_code == 200
    assert set(r.json()) == {"token", "role", "name"} and r.json()["role"] == "patient"
    assert client.post("/auth/login", json={"email": "pat@example.com", "password": "nope"}).status_code == 401
    assert client.post("/auth/register", json={"email": "pat@example.com", "password": "password123",
                                               "role": "patient"}).status_code == 409


def test_predict_and_history(client):
    h = _register(client, "p2@example.com")
    r = client.post("/predict", headers=h, json={"target_letter": "circle", "points": webcam_points(),
                                                 "frame_aspect": 16 / 9})
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("letter", "confidence", "accuracy_score", "smoothness_score", "session_id"):
        assert k in body
    assert body["letter"] == "circle" and 0 <= body["accuracy_score"] <= 100
    hist = client.get("/history?limit=10", headers=h).json()
    assert len(hist) == 1
    assert set(hist[0]) == {"session_id", "created", "target_letter", "predicted_letter", "confidence",
                            "accuracy_score", "smoothness_score", "points"}


def test_predict_errors(client):
    h = _register(client, "p3@example.com")
    assert client.post("/predict", json={"target_letter": "circle", "points": webcam_points()}).status_code == 401
    r = client.post("/predict", headers=h, json={"target_letter": "Q", "points": webcam_points()})
    assert r.status_code == 422
    r = client.post("/predict", headers=h, json={"target_letter": "circle", "points": [[0.5, 0.5, 0]] * 3})
    assert r.status_code == 422 and "too few points" in r.json()["detail"]
    r = client.post("/predict", headers=h, json={"target_letter": "circle", "points": [[50, 50, 0]] * 20})
    assert r.status_code == 422


def test_clinician_flow(client):
    hp = _register(client, "linked@example.com")
    client.post("/predict", headers=hp, json={"target_letter": "L", "points": webcam_points("L")})
    hc = _register(client, "clinic@example.com", role="clinician")
    assert client.get("/clinician/patients", headers=hp).status_code == 403
    assert client.get("/clinician/patients", headers=hc).json() == []
    r = client.post("/clinician/patients", headers=hc, json={"email": "linked@example.com"})
    assert r.status_code == 201
    pid = r.json()["id"]
    pts = client.get("/clinician/patients", headers=hc).json()
    assert pts[0]["sessions_total"] == 1 and pts[0]["last_active"]
    hist = client.get(f"/clinician/patients/{pid}/history", headers=hc).json()
    assert hist[0]["target_letter"] == "L"
    other = _register(client, "notlinked@example.com")
    other_id = client.get("/auth/me", headers=other).json()["id"]
    assert client.get(f"/clinician/patients/{other_id}/history", headers=hc).status_code == 404


def test_delete_account(client):
    h = _register(client, "bye@example.com")
    assert client.delete("/auth/me", headers=h).status_code == 204
    assert client.get("/history", headers=h).status_code == 401
