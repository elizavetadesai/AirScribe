# AirScribe backend (FastAPI)

Receives fingertip coordinates (never video), runs the trained model with ONNX Runtime, scores the
movement, and stores attempts for patient and clinician views.

## Run locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # optional locally
uvicorn app.main:app --reload --port 8000
```

* API docs (try every endpoint): http://localhost:8000/docs
* Health and model status: http://localhost:8000/health
* Frontend: set `VITE_API_URL=http://localhost:8000` and `VITE_USE_MOCK=false` in the frontend's `.env.local`.

The model files `models/airscribe.onnx` and `models/airscribe_meta.json` come from `ml/export_onnx.py`.
Without them the API runs but `/predict` answers 503 "model not loaded".

## Tests

```bash
pytest -q
```

They use a temporary database and a stand-in model, and check register/login, predict, history,
the clinician flow, permissions, input validation and account deletion.

## Endpoints

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/register` | anyone | `{email, password (8+), role: patient|clinician}` → `{token, role, name}` |
| POST | `/auth/login` | anyone | → `{token, role, name}` |
| GET / DELETE | `/auth/me` | logged in | DELETE removes the account and all its attempts |
| POST | `/predict` | logged in | `{target_letter, points, frame_aspect}` → prediction, scores, details, timing |
| GET | `/history?limit=` | logged in | own attempts, newest first |
| GET / POST | `/clinician/patients` | clinician | list linked patients / link one by email |
| DELETE | `/clinician/patients/{id}` | clinician | unlink |
| GET | `/clinician/patients/{id}/history` | clinician | only for linked patients |
| GET | `/health`, `/targets` | anyone | status, model info, target list |

Every response has an `X-Process-Time-Ms` header, and `/predict` returns `timing_ms`
(preprocess / model / scoring), which you can use for the latency section of the report.

## Deploy

The shared ML code is in `../ml/airscribe_ml`, so build from the **repo root**.

**Render (web service, free):**
* Root directory: *(empty = repo root)*
* Build command: `pip install -r backend/requirements.txt`
* Start command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
* Environment: `JWT_SECRET` (long random string), `CORS_ORIGINS=https://<your-app>.vercel.app`,
  `DATABASE_URL` (see below)

**Hugging Face Spaces (Docker):** create a Docker Space, push this repo, and put the Dockerfile at the
root of the Space (copy `backend/Dockerfile` to `Dockerfile`). It listens on 7860. Set the same secrets.

**Database:** free hosts wipe the disk on restart, so SQLite loses accounts. For the deployed demo use a
free Postgres (Neon, Supabase or Render Postgres) and set `DATABASE_URL`. Tables are created on startup.

**Cold starts:** free Render services sleep after inactivity; the first request can take ~1 minute.
Open `/health` a few minutes before the live demo.

## Security notes (for the report)

* Passwords hashed with scrypt (Python standard library), never stored in plain text.
* JWT bearer tokens, 12-hour expiry; clinicians can only read patients they linked.
* Input validation: point count limit, coordinate range, finite numbers, known targets.
* No video or images are received or stored, only coordinates.
* Not done (state as future work): rate limiting, email verification, patient consent before a clinician
  links them, audit logs, encryption at rest.
