"""Synthetic air-drawing trajectories for pretraining.

Each sample is built from a class template (templates.py):
  1. pick a variant, start point and direction
  2. warp it (rotation, uneven scaling, shear, imperfect corners, open/overshot circles)
  3. move along it with a minimum-jerk speed profile per stroke, which is how
     smooth human reaching movements are modelled (Flash & Hogan, 1985),
     including short pauses at corners
  4. sample at a webcam frame rate (24-32 fps, timing jitter, dropped frames)
  5. add tremor (4-9 Hz), slow drift and tracking jitter
  6. add the still hand before/after the drawing

Output is in the *user's* view (no mirroring), equal units on both axes, t in ms,
i.e. the same space as preprocess.prepare(..., from_webcam=False).

This is a stand-in for pretraining only. Report results on real recordings.
"""
from __future__ import annotations

import numpy as np

from .classes import CLASSES, OTHER
from .templates import CLOSED, REVERSIBLE, TEMPLATES, densify

NOISE = {
    # tremor amplitude, drift amplitude, jitter sigma (all relative to drawing size)
    "clean": (0.0, 0.0, 0.002),
    "normal": (0.015, 0.03, 0.008),
    "heavy": (0.05, 0.08, 0.02),
}


def _min_jerk(n: int) -> np.ndarray:
    t = np.linspace(0, 1, n)
    return 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5


def _orient(path: np.ndarray, cls: str, smooth: bool, rng) -> np.ndarray:
    p = path.copy()
    if cls in CLOSED:
        ring = p[:-1] if np.allclose(p[0], p[-1]) else p
        k = rng.integers(len(ring))
        ring = np.roll(ring, -k, axis=0)
        p = np.vstack([ring, ring[:1]])
    if cls in REVERSIBLE and rng.random() < 0.5:
        p = p[::-1]
    return p


def _warp(p: np.ndarray, cls: str, smooth: bool, rng) -> np.ndarray:
    p = p.copy()
    if not smooth:  # imperfect corners
        p += rng.normal(0, 0.05, p.shape)
        if cls in CLOSED and rng.random() < 0.7:  # start and end don't meet exactly
            p[-1] = p[-1] + rng.normal(0, 0.08, 2)
    if cls == "circle":
        keep = rng.uniform(0.88, 1.08)
        n = len(p)
        if keep < 1:
            p = p[: max(8, int(n * keep))]
        else:
            p = np.vstack([p, p[1: int(n * (keep - 1)) + 2]])
    ang = np.deg2rad(rng.normal(0, 6))
    rot = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
    sx, sy = rng.uniform(0.82, 1.18, 2)
    shear = rng.normal(0, 0.06)
    m = rot @ np.array([[sx, shear], [0, sy]])
    return p @ m.T


def _timed_path(p: np.ndarray, smooth: bool, rng, total_s: float, hz: int = 1000):
    """Dense (x, y, t) along the path with min-jerk timing per segment."""
    if smooth:
        dense = densify(p, 0.01)
        seg = np.linalg.norm(np.diff(dense, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        n = max(10, int(total_s * hz))
        q = _min_jerk(n) * s[-1]
        xy = np.stack([np.interp(q, s, dense[:, 0]), np.interp(q, s, dense[:, 1])], 1)
        return np.column_stack([xy, np.linspace(0, total_s, n)])
    lens = np.linalg.norm(np.diff(p, axis=0), axis=1)
    w = lens ** 0.6
    durs = total_s * w / w.sum()
    out, t0 = [], 0.0
    for a, b, d in zip(p[:-1], p[1:], durs):
        n = max(4, int(d * hz))
        s = _min_jerk(n)[:, None]
        seg = a + (b - a) * s
        out.append(np.column_stack([seg, t0 + np.linspace(0, d, n)]))
        t0 += d
        pause = rng.uniform(0, 0.12)  # brief stop at the corner
        if pause > 0.01:
            out.append(np.column_stack([np.repeat(b[None], 3, 0), t0 + np.linspace(0, pause, 3)]))
            t0 += pause
    return np.vstack(out)


def _sample_frames(dense: np.ndarray, rng) -> np.ndarray:
    fps = rng.uniform(24, 32)
    t_end = dense[-1, 2]
    ts = np.arange(0, t_end, 1 / fps) + rng.normal(0, 0.003, int(np.ceil(t_end * fps)))[: len(np.arange(0, t_end, 1 / fps))]
    ts = np.clip(np.sort(ts), 0, t_end)
    keep = rng.random(len(ts)) > 0.03
    ts = ts[keep]
    xy = np.stack([np.interp(ts, dense[:, 2], dense[:, 0]), np.interp(ts, dense[:, 2], dense[:, 1])], 1)
    return np.column_stack([xy, ts])


def _add_noise(f: np.ndarray, rng, level: str) -> np.ndarray:
    trem_a, drift_a, jit = NOISE[level]
    f = f.copy()
    t = f[:, 2]
    if trem_a > 0:
        a = rng.uniform(0.3, 1.0) * trem_a
        hz = rng.uniform(4, 9)
        ph = rng.uniform(0, 2 * np.pi, 2)
        f[:, 0] += a * np.sin(2 * np.pi * hz * t + ph[0]) * rng.uniform(0.3, 1)
        f[:, 1] += a * np.sin(2 * np.pi * hz * t + ph[1]) * rng.uniform(0.3, 1)
    if drift_a > 0 and len(f) > 3:
        walk = np.cumsum(rng.normal(0, 1, (len(f), 2)), 0)
        k = max(3, len(f) // 4)
        walk = np.apply_along_axis(lambda c: np.convolve(c, np.ones(k) / k, "same"), 0, walk)
        walk -= walk[0]
        span = np.abs(walk).max() or 1
        f[:, :2] += walk / span * drift_a * rng.uniform(0.2, 1)
    f[:, :2] += rng.normal(0, jit, (len(f), 2))
    return f


def _hold(point: np.ndarray, t0: float, dur: float, rng, fps: float = 30) -> np.ndarray:
    n = int(dur * fps)
    if n <= 0:
        return np.zeros((0, 3))
    xy = point + rng.normal(0, 0.004, (n, 2))
    return np.column_stack([xy, t0 + np.arange(n) / fps])


def _other_path(rng) -> tuple[np.ndarray, bool]:
    kind = rng.integers(4)
    if kind == 0:  # random scribble
        n = rng.integers(6, 14)
        return rng.uniform(-1, 1, (n, 2)), rng.random() < 0.5
    if kind == 1:  # spiral
        a = np.linspace(0, rng.uniform(3, 5) * np.pi, 120)
        r = np.linspace(0.1, 1, 120)
        return np.stack([r * np.cos(a), r * np.sin(a)], 1), True
    if kind == 2:  # five-point star
        k = np.arange(6) * 4 * np.pi / 5 - np.pi / 2
        return np.stack([np.cos(k), np.sin(k)], 1), False
    # cross / X shape
    return np.array([[-1, -1], [1, 1], [1, -1], [-1, 1]], float), False


def synth_trajectory(cls: str, rng=None, level: str | None = None) -> np.ndarray:
    rng = rng or np.random.default_rng()
    level = level or rng.choice(["clean", "normal", "normal", "heavy"])
    if cls == OTHER:
        path, smooth = _other_path(rng)
    else:
        variants = TEMPLATES[cls]
        path, smooth = variants[rng.integers(len(variants))]
        path = _orient(path, cls, smooth, rng)
    path = _warp(path, cls, smooth, rng)

    total = rng.uniform(1.0, 4.0) * (1.3 if cls in ("A", "S", "T", "square", "wave") else 1.0)
    dense = _timed_path(path, smooth, rng, total)
    frames = _add_noise(_sample_frames(dense, rng), rng, level)

    lead = _hold(frames[0, :2], 0, rng.uniform(0, 0.4), rng)
    frames[:, 2] += lead[-1, 2] + 1 / 30 if len(lead) else 0
    tail = _hold(frames[-1, :2], frames[-1, 2] + 1 / 30, rng.uniform(0, 0.4), rng)
    arr = np.vstack([lead, frames, tail])

    # place in a "frame": size 0.2-0.5 units, random position, t in ms
    size = rng.uniform(0.1, 0.25)
    arr[:, :2] = arr[:, :2] * size + rng.uniform(0.4, 1.2, 2)
    arr[:, 2] *= 1000.0
    return arr


def synth_dataset(n_per_class: int, seed: int = 0, classes=None, level=None):
    rng = np.random.default_rng(seed)
    classes = classes or CLASSES
    out = []
    for cls in classes:
        for _ in range(n_per_class):
            out.append({"label": cls, "points": synth_trajectory(cls, rng, level).round(5).tolist(),
                        "source": "synthetic", "participant": "SYN"})
    return out
