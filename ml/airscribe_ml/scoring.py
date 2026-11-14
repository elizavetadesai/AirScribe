"""Movement quality scores.

Smoothness uses two standard, deterministic measures from the motor-control
literature (same movement in -> same score out, so sessions are comparable):

  * SPARC - spectral arc length of the speed profile
            (Balasubramanian et al., 2012; 2015). Closer to 0 = smoother.
  * LDLJ  - log dimensionless jerk (Hogan & Sternad, 2009;
            Balasubramanian et al., 2015). Closer to 0 = smoother.

Both are mapped to 0-100 with per-class bounds, because shapes with corners
(square, triangle, letters) naturally have speed dips and would otherwise
always look "less smooth" than a circle. Default bounds come from synthetic
clean vs. noisy drawings (see synthetic.py); `calibrate_smoothness()` lets you
replace them with percentiles from your own healthy-volunteer recordings.

Accuracy combines the model's probability for the target class with a shape
similarity (symmetric Chamfer distance to the template, any start point and
direction). Rotation is not removed on purpose: a tilted "horizontal line" is
less accurate.

These are rehabilitation-game scores, not clinical measures.
"""
from __future__ import annotations

import numpy as np
from scipy.signal import butter, filtfilt
from scipy.spatial import cKDTree

from .templates import fit_unit_box, template_point_sets

FS = 60.0          # resample rate (Hz) before computing smoothness
CUTOFF_HZ = 10.0   # low-pass: removes webcam jitter, keeps 4-9 Hz tremor

# Per-class (worst, best) bounds. Filled with synthetic defaults; overwritten
# by checkpoint metadata when available (see backend inference.py).
# Derived with calibrate_scores.py --synthetic: best = median of clean synthetic
# drawings, worst = heavy-tremor median minus half the clean-heavy gap.
# Re-run calibrate_scores.py on your own recordings and ship score_bounds.json.
DEFAULT_BOUNDS = {
    "sparc": {"hline": (-2.96, -1.4), "vline": (-3.41, -1.4), "circle": (-2.29, -1.4),
              "square": (-3.79, -3.09), "triangle": (-3.44, -2.8), "wave": (-3.15, -1.41),
              "L": (-3.12, -2.01), "T": (-3.65, -2.73), "S": (-2.65, -1.4), "A": (-3.11, -2.35),
              "other": (-3.18, -2.81), "_default": (-3.24, -1.92)},
    "ldlj": {"hline": (-17.41, -11.12), "vline": (-18.54, -11.02), "circle": (-15.6, -8.67),
             "square": (-16.4, -11.56), "triangle": (-15.69, -10.01), "wave": (-18.41, -12.45),
             "L": (-17.9, -10.2), "T": (-17.17, -10.59), "S": (-17.71, -10.63), "A": (-17.31, -11.26),
             "other": (-15.53, -11.39), "_default": (-16.94, -10.95)},
}


# --------------------------------------------------------------------------- smoothness
def _uniform_time(arr: np.ndarray, fs: float = FS):
    t = (arr[:, 2] - arr[0, 2]) / 1000.0
    if t[-1] <= 0:
        raise ValueError("zero duration")
    tu = np.arange(0, t[-1], 1 / fs)
    xy = np.stack([np.interp(tu, t, arr[:, 0]), np.interp(tu, t, arr[:, 1])], 1)
    return tu, xy


def _lowpass(x: np.ndarray, fs: float = FS, fc: float | None = None) -> np.ndarray:
    fc = fc or CUTOFF_HZ
    b, a = butter(2, fc / (fs / 2))
    if len(x) <= 3 * max(len(a), len(b)):
        return x
    return filtfilt(b, a, x, axis=0)


def speed_profile(arr: np.ndarray, fs: float = FS) -> np.ndarray:
    _, xy = _uniform_time(arr, fs)
    xy = fit_unit_box(xy)  # size-free units
    xy = _lowpass(xy, fs)
    v = np.linalg.norm(np.gradient(xy, 1 / fs, axis=0), axis=1)
    return v


def sparc(speed: np.ndarray, fs: float = FS, padlevel: int = 4,
          fc: float = 10.0, amp_th: float = 0.05) -> float:
    """Spectral arc length (Balasubramanian et al., 2015 reference algorithm)."""
    if len(speed) < 4 or speed.max() <= 0:
        return float("nan")
    nfft = int(2 ** (np.ceil(np.log2(len(speed))) + padlevel))
    f = np.arange(0, fs, fs / nfft)
    mag = np.abs(np.fft.fft(speed, nfft))
    mag = mag / mag.max()
    sel = f <= fc
    f_sel, m_sel = f[sel], mag[sel]
    above = np.nonzero(m_sel >= amp_th)[0]
    f_sel = f_sel[above[0]:above[-1] + 1]
    m_sel = m_sel[above[0]:above[-1] + 1]
    if len(f_sel) < 2:
        return 0.0
    df = np.diff(f_sel) / (f_sel[-1] - f_sel[0])
    return float(-np.sum(np.sqrt(df ** 2 + np.diff(m_sel) ** 2)))


def ldlj(speed: np.ndarray, fs: float = FS) -> float:
    """Log dimensionless jerk from the speed profile."""
    if len(speed) < 5 or speed.max() <= 0:
        return float("nan")
    dt = 1 / fs
    duration = len(speed) * dt
    jerk = np.gradient(np.gradient(speed, dt), dt)
    dlj = (duration ** 3 / speed.max() ** 2) * np.sum(jerk ** 2) * dt
    return float(-np.log(max(dlj, 1e-12)))


def n_speed_peaks(speed: np.ndarray, rel: float = 0.1) -> int:
    from scipy.signal import find_peaks
    if len(speed) < 3:
        return 0
    peaks, _ = find_peaks(speed, height=rel * speed.max(), prominence=rel * speed.max())
    return int(len(peaks))


def _to_score(value: float, bounds: tuple[float, float]) -> float:
    worst, best = bounds
    if not np.isfinite(value) or best == worst:
        return 0.0
    return float(np.clip((value - worst) / (best - worst), 0, 1) * 100)


def _bounds(metric: str, cls: str | None, table: dict | None):
    table = table or DEFAULT_BOUNDS
    m = table.get(metric, DEFAULT_BOUNDS[metric])
    return tuple(m.get(cls, m.get("_default", DEFAULT_BOUNDS[metric]["_default"])))


def smoothness(arr: np.ndarray, cls: str | None = None, bounds: dict | None = None) -> dict:
    """arr: cleaned N x 3 (x, y, t_ms). Returns metrics and a 0-100 score."""
    v = speed_profile(arr)
    s = sparc(v)
    j = ldlj(v)
    score = 0.5 * _to_score(s, _bounds("sparc", cls, bounds)) + \
        0.5 * _to_score(j, _bounds("ldlj", cls, bounds))
    return {
        "sparc": s,
        "ldlj": j,
        "speed_peaks": n_speed_peaks(v),
        "duration_s": float((arr[-1, 2] - arr[0, 2]) / 1000.0),
        "score": round(score, 1),
    }


def calibrate_smoothness(samples_by_class: dict[str, list[np.ndarray]],
                         best_pct: float = 75, spread: float = 2.5) -> dict:
    """Bounds from healthy recordings: best = 75th percentile, worst = best -
    2.5 x IQR. Healthy volunteers then mostly score 70-100 and noisier movement
    falls below. Returns a table in DEFAULT_BOUNDS format."""
    table = {"sparc": {}, "ldlj": {}}
    pooled = {"sparc": [], "ldlj": []}
    for cls, arrs in samples_by_class.items():
        vals = {"sparc": [], "ldlj": []}
        for a in arrs:
            try:
                v = speed_profile(a)
            except ValueError:
                continue
            vals["sparc"].append(sparc(v))
            vals["ldlj"].append(ldlj(v))
        for k in vals:
            x = np.array([y for y in vals[k] if np.isfinite(y)])
            pooled[k].extend(x.tolist())
            if len(x) >= 8:
                p25, best = np.percentile(x, [25, best_pct])
                table[k][cls] = (float(best - spread * max(best - p25, 1e-3)), float(best))
    for k in pooled:
        x = np.array(pooled[k])
        if len(x) >= 8:
            p25, best = np.percentile(x, [25, best_pct])
            table[k]["_default"] = (float(best - spread * max(best - p25, 1e-3)), float(best))
        else:
            table[k]["_default"] = DEFAULT_BOUNDS[k]["_default"]
    return table


# --------------------------------------------------------------------------- accuracy
def chamfer(a: np.ndarray, b: np.ndarray) -> float:
    da, _ = cKDTree(b).query(a)
    db, _ = cKDTree(a).query(b)
    return float(0.5 * (da.mean() + db.mean()))


def shape_similarity(arr: np.ndarray, cls: str, scale: float = 0.18) -> float:
    """1.0 = matches the template exactly, ~0 = unrelated shape."""
    from .preprocess import resample_arclength
    xy = fit_unit_box(arr[:, :2])
    pts = resample_arclength(xy, 128)
    best = min(chamfer(pts, tpl) for tpl in template_point_sets(cls))
    return float(np.exp(-(best / scale) ** 2))


def accuracy_score(p_target: float, similarity: float, w_model: float = 0.5) -> float:
    return round(100 * (w_model * p_target + (1 - w_model) * similarity), 1)
