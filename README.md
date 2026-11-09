# ✍️ AirScribe — Air-Writing Rehabilitation

A browser-based hand rehabilitation game for stroke patients. Write letters in the air with your index finger while a webcam tracks your movement in real time — no video ever leaves your device.

---

## Features

| | |
|---|---|
| 🤚 **In-browser hand tracking** | MediaPipe HandLandmarker runs entirely client-side |
| 📹 **Privacy-first** | Only fingertip XY coordinates are sent to the server |
| 🎮 **Practice game loop** | Letter-by-letter practice with live trail feedback |
| 📊 **Progress dashboard** | Streaks, weekly goals, accuracy trends, per-letter performance |
| 🩺 **Clinician view** | Linked patients' progress charts (read-only) |
| 🌙 **Light & dark mode** | Respects system preference, toggleable in navbar |
| ♿ **Accessible** | 44px min touch targets, keyboard navigation, `aria-live` regions |
| 🧪 **Mock mode** | Full frontend works without a backend (`VITE_USE_MOCK=true`) |

---

## Quick start

```bash
# 1. Clone
git clone <repo-url>
cd airscribe

# 2. Install
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env as needed

# 4. Run (mock mode — no backend required)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

**Default mock login:**
- Patient: any email **not** containing "clinic" + any password
- Clinician: email containing "clinic" (e.g. `dr.smith@clinic.com`) + any password

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `http://localhost:8000` | Backend base URL (no trailing slash) |
| `VITE_USE_MOCK` | No | — | Set `true` to use mock API (no backend needed) |

Create a `.env` file (copy from `.env.example`):

```
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK=true
```

---

## Project structure

```
src/
├── config/
│   └── letters.js          ← letter set (single source of truth)
├── api/
│   ├── client.js            ← base fetch wrapper
│   ├── mock.js              ← mock implementations
│   └── endpoints.js         ← all API calls
├── contexts/
│   ├── AuthContext.jsx      ← token + user state
│   └── ThemeContext.jsx     ← light/dark
├── hooks/
│   ├── useCamera.js         ← getUserMedia + error handling
│   └── useHandTracker.js    ← MediaPipe HandLandmarker loop
├── components/
│   ├── layout/              ← AppShell, Navbar, ProtectedRoute
│   ├── ui/                  ← Button, Card, Badge, Spinner, Alert, Modal
│   ├── practice/            ← CameraCanvas, TrailReplay, ResultCard, HandStatus
│   └── charts/              ← TrendLine, LetterHeatmap, StreakBadge
└── pages/
    ├── Auth.jsx             ← sign up / log in
    ├── Practice.jsx         ← main game loop
    ├── Dashboard.jsx        ← patient progress
    ├── History.jsx          ← session table + replay
    ├── ClinicianView.jsx    ← patient list + charts
    └── Settings.jsx         ← privacy + account deletion
```

### Changing the letter set

Edit `src/config/letters.js` — all pages read from this single file:

```js
export const LETTERS = ['A', 'C', 'E', 'L', 'M', 'O', 'S', 'T', 'V', 'Z']
```

---

## API calls

All calls are in `src/api/endpoints.js`. The backend must implement:

| Method | Path | Auth | Body / params | Response |
|---|---|---|---|---|
| `POST` | `/auth/register` | None | `{ email, password, role }` | `{ token }` |
| `POST` | `/auth/login` | None | `{ email, password }` | `{ token, role, name? }` |
| `POST` | `/predict` | Bearer | `{ target_letter, points: [[x,y,t_ms],...] }` | `{ letter, confidence, accuracy_score, smoothness_score, session_id }` |
| `GET` | `/history?limit=N` | Bearer | — | `[{ session_id, created, target_letter, predicted_letter, confidence, accuracy_score, smoothness_score, points }]` |
| `GET` | `/clinician/patients` | Bearer (clinician) | — | `[{ id, name, email, sessions_total, last_active }]` |
| `GET` | `/clinician/patients/{id}/history` | Bearer (clinician) | — | same as `/history` |

### Tracking details

- Landmark **index 8** (index fingertip) from the **first detected hand**
- Coordinates are **normalized 0–1**, stored **without mirroring** (display mirroring is CSS `transform: scaleX(-1)` only)
- Each point: `[x: number, y: number, t_ms: number]` (t = ms since recording start)
- Minimum **10 points** required before submitting — shorter attempts are rejected client-side

---

## Build & deploy

```bash
# Production build
npm run build

# Preview the build locally
npm run preview
```

The `dist/` folder is a static site, deployable to **Vercel**, Netlify, or any CDN.

**Vercel deploy:**
```bash
npx vercel --prod
```

Set `VITE_API_URL` and optionally `VITE_USE_MOCK` as environment variables in the Vercel project settings.

---

## Tech stack

- **React 18 + Vite** — fast dev server, optimised build
- **Tailwind CSS v3** — utility-first styling, dark mode via `.dark` class
- **React Router v6** — client-side routing with role-based protection
- **Recharts** — trend line and bar charts
- **MediaPipe Tasks Vision** — in-browser hand landmark detection (CDN)

---

## Medical disclaimer

AirScribe is a rehabilitation **support tool**, not a medical device. It is not intended to diagnose, treat, cure, or prevent any disease or medical condition. Always consult a qualified healthcare provider.
