"""Ideal shapes ("templates") for every target class.

Coordinates are in the *user's* view (what the patient sees on the mirrored
screen), y pointing down, roughly inside [-1, 1].

Each class has one or more variants. A variant is a list of waypoints in the
order a person would typically draw it. Because air-writing has no pen lift,
multi-stroke letters include the "connector" movement between strokes.

Templates are used in two places:
  * synthetic.py  - to generate pretraining trajectories
  * scoring.py    - as the reference shape for the accuracy score
"""
from __future__ import annotations

import numpy as np


def _circle(n: int = 64) -> np.ndarray:
    a = np.linspace(-np.pi / 2, 1.5 * np.pi, n)
    return np.stack([np.cos(a), np.sin(a)], 1)


def _wave(periods: float, amp: float = 0.35, n: int = 96) -> np.ndarray:
    x = np.linspace(-1, 1, n)
    y = -amp * np.sin(np.pi * periods * (x + 1))
    return np.stack([x, y], 1)


def _smooth_path(pts, n: int = 80) -> np.ndarray:
    """Catmull-Rom spline through the given control points."""
    p = np.asarray(pts, float)
    p = np.vstack([p[0], p, p[-1]])
    out = []
    seg = max(2, n // (len(p) - 3))
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for t in np.linspace(0, 1, seg, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(p[-2])
    return np.asarray(out)


_S_CTRL = [(0.65, -0.75), (0.2, -1.0), (-0.45, -0.9), (-0.6, -0.5), (-0.2, -0.1),
           (0.4, 0.15), (0.65, 0.55), (0.35, 0.95), (-0.25, 1.0), (-0.65, 0.75)]

# (waypoints, is_smooth). Smooth paths get one continuous movement; polylines
# get a separate sub-movement per segment (people slow down at corners).
TEMPLATES: dict[str, list[tuple[np.ndarray, bool]]] = {
    "hline": [(np.array([[-1.0, 0.0], [1.0, 0.0]]), False)],
    "vline": [(np.array([[0.0, -1.0], [0.0, 1.0]]), False)],
    "circle": [(_circle(), True)],
    "square": [(np.array([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]], float), False)],
    "triangle": [(np.array([[0, -1], [1, 0.8], [-1, 0.8], [0, -1]], float), False)],
    "wave": [(_wave(k), True) for k in (1.5, 2.0, 2.5, 3.0)],
    "L": [(np.array([[-0.55, -1], [-0.55, 1], [0.55, 1]], float), False)],
    "T": [
        # bar first, back to the middle, then the stem
        (np.array([[-0.8, -1], [0.8, -1], [0, -1], [0, 1]], float), False),
        # stem first (top to bottom), connector up-left, then the bar
        (np.array([[0, -1], [0, 1], [-0.8, -1], [0.8, -1]], float), False),
    ],
    "S": [(_smooth_path(_S_CTRL), True)],
    "A": [
        # left leg up, right leg down, back up to the bar, bar right-to-left
        (np.array([[-0.8, 1], [0, -1], [0.8, 1], [0.4, 0.2], [-0.4, 0.2]], float), False),
        # legs, connector across to the left side of the bar, bar left-to-right
        (np.array([[-0.8, 1], [0, -1], [0.8, 1], [-0.4, 0.2], [0.4, 0.2]], float), False),
    ],
}

# Classes whose drawing can start at any point and go either direction.
CLOSED = {"circle", "square", "triangle"}
# Classes that may be drawn in reverse (e.g. a line right-to-left).
REVERSIBLE = {"hline", "vline", "wave", "circle", "square", "triangle"}


def densify(poly: np.ndarray, step: float = 0.02) -> np.ndarray:
    """Insert points along each segment so spacing is at most `step`."""
    poly = np.asarray(poly, float)
    out = [poly[0]]
    for a, b in zip(poly[:-1], poly[1:]):
        n = max(1, int(np.ceil(np.linalg.norm(b - a) / step)))
        for t in np.linspace(0, 1, n + 1)[1:]:
            out.append(a + (b - a) * t)
    return np.asarray(out)


def fit_unit_box(xy: np.ndarray) -> np.ndarray:
    """Centre on the bounding box and scale the longer side to [-1, 1]."""
    lo, hi = xy.min(0), xy.max(0)
    span = float(max(hi - lo))
    if span < 1e-9:
        return xy - (lo + hi) / 2
    return (xy - (lo + hi) / 2) / (span / 2)


def template_point_sets(cls: str) -> list[np.ndarray]:
    """Dense point sets of every variant, normalised like a user drawing."""
    return [fit_unit_box(densify(p)) for p, _ in TEMPLATES[cls]]
