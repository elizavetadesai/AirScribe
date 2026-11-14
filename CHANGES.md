# Changes (15 Nov 2026)

## New
- `ml/`: CNN + BiGRU model (AirScribeNet), data prep for Quick, Draw!, hand-drawn shapes, A–Z letters,
  synthetic trajectories and our own recordings; training, evaluation (ablation table, confusion matrix,
  latency), ONNX export, smoothness calibration, smoke test. See `ml/README.md`.
- `backend/`: FastAPI with auth, `/predict`, history, clinician linking, account deletion, SQLite/Postgres,
  ONNX Runtime inference, tests, Dockerfile. See `backend/README.md`.
- `/collect` page: records training data with the same tracking code as Practice; downloads JSON.
- Targets are now shapes + letters (`src/config/targets.js`), shown as outline icons, with Level 1/2.

## Fixed
- Camera stream not attached when the video element mounted after the camera started (black preview).
- Choosing a target in the picker replaced it with a random one.
- Drawings were squashed sideways on 16:9 cameras (MediaPipe scales x and y differently): the frontend
  now sends `frame_aspect`.
- Replay drew raw camera positions (tiny/off-centre); now scaled to fit, with the ideal shape behind it.
- Trail overlay misaligned on 4:3 cameras.
- Wrong password showed "Session expired"; expired sessions now log out properly.
- Account deletion only logged out; now deletes the account on the server.
- Clinicians had no way to link a patient; added "Add patient by email".
- Mock mode always said "Correct"; now sometimes returns a different shape.
- `.gitignore` now ignores `dist/`, `.env`, Python caches, datasets and training runs.
- `vercel.json` added so refreshing `/practice` etc. does not 404 on Vercel.
