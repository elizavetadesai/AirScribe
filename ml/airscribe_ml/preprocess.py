"""Turn raw fingertip points into model inputs.

Pipeline (identical for training and for the live backend):

    raw webcam points [[x, y, t_ms], ...]   x, y in 0..1 of the camera frame, NOT mirrored
        -> clean_points()      validate, sort by time, drop duplicates and tracking spikes
        -> webcam_to_user()    flip x (user's view) and undo the frame aspect squash
        -> trim_idle()         drop the still hand before/after the drawing
        -> fit_unit_box()      centre, scale longer side to [-1, 1] (aspect kept)
        -> sequence_features() 64 x 6 array for the GRU branch
        -> rasterize()         64 x 64 image for the CNN branch

Public datasets (Quick, Draw!, synthetic) are already in the user's view, so
they skip webcam_to_user(). Image datasets go through normalize_image() so they
look like our rasterised trajectories (same framing, same stroke width).
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from .templates import fit_unit_box

N_POINTS = 64          # sequence length after resampling
IMG_SIZE = 64          # image side for the CNN
N_FEATURES = 6         # x, y, dx, dy, time fraction, local slowness
_RENDER = 256          # draw at 4x and downsample, which anti-aliases
_MARGIN = 0.1          # empty border around the drawing (fraction of side)
_STROKE = 10           # stroke width at 256 px  (~2.5 px at 64 px)
DEFAULT_ASPECT = 16 / 9  # frontend asks for 1280x720


class TrajectoryError(ValueError):
    """Raised for input that cannot be a drawing (too short, too small, ...)."""


# --------------------------------------------------------------------------- cleaning
def clean_points(points, min_points: int = 10) -> np.ndarray:
    arr = np.asarray(points, dtype=float)
    if arr.ndim != 2 or arr.shape[1] not in (2, 3):
        raise TrajectoryError("points must be a list of [x, y, t] triples")
    if arr.shape[1] == 2:  # no timestamps: assume 30 fps
        arr = np.column_stack([arr, np.arange(len(arr)) * 1000.0 / 30])
    arr = arr[np.isfinite(arr).all(1)]
    if len(arr) == 0:
        raise TrajectoryError("no valid points")
    arr = arr[np.argsort(arr[:, 2], kind="stable")]
    # drop repeated timestamps (keep the last sample at each time)
    keep = np.append(np.diff(arr[:, 2]) > 0, True)
    arr = arr[keep]
    arr = _remove_spikes(arr)
    if len(arr) < min_points:
        raise TrajectoryError(f"too few points ({len(arr)}/{min_points})")
    return arr


def _remove_spikes(arr: np.ndarray, k: float = 6.0) -> np.ndarray:
    """Remove single-frame tracking glitches: a point far from both neighbours
    while the neighbours are close to each other."""
    if len(arr) < 5:
        return arr
    xy = arr[:, :2]
    step = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    med = max(np.median(step), 1e-3)
    skip = np.linalg.norm(xy[2:] - xy[:-2], axis=1)
    bad = np.zeros(len(arr), bool)
    bad[1:-1] = (step[:-1] > k * med) & (step[1:] > k * med) & (skip < k * med)
    return arr[~bad]


def webcam_to_user(arr: np.ndarray, aspect: float | None = None) -> np.ndarray:
    """Raw MediaPipe coords -> user's view, with equal units on both axes.

    MediaPipe normalises x by frame width and y by frame height, so on a 16:9
    camera a real circle arrives squashed. Multiplying x by width/height fixes
    it. x is flipped because the camera sees the user's drawing mirrored.
    """
    aspect = float(aspect) if aspect else DEFAULT_ASPECT
    out = arr.copy()
    out[:, 0] = (1.0 - arr[:, 0]) * aspect
    return out


def trim_idle(arr: np.ndarray, frac: float = 0.08) -> np.ndarray:
    """Cut the still hand at the start and end (speed below `frac` of peak)."""
    if len(arr) < 8:
        return arr
    xy, t = arr[:, :2], arr[:, 2] / 1000.0
    dt = np.maximum(np.diff(t), 1e-3)
    v = np.linalg.norm(np.diff(xy, axis=0), axis=1) / dt
    if len(v) >= 5:  # light moving average so one jittery frame does not count
        v = np.convolve(v, np.ones(5) / 5, mode="same")
    if v.max() <= 0:
        return arr
    moving = np.nonzero(v > frac * v.max())[0]
    lo, hi = moving[0], moving[-1] + 2
    out = arr[lo:hi]
    return out if len(out) >= 8 else arr


def prepare(points, aspect: float | None = None, from_webcam: bool = True,
            min_points: int = 10, min_extent: float = 0.03) -> np.ndarray:
    """Full cleaning. Returns N x 3 array (x, y in user view; t in ms)."""
    arr = clean_points(points, min_points)
    if from_webcam:
        arr = webcam_to_user(arr, aspect)
    arr = trim_idle(arr)
    extent = float(max(arr[:, :2].max(0) - arr[:, :2].min(0)))
    if extent < min_extent:
        raise TrajectoryError("drawing is too small - move your finger further")
    return arr


# --------------------------------------------------------------------------- features
def resample_arclength(xy: np.ndarray, n: int = N_POINTS, extra: np.ndarray | None = None):
    """Resample so points are equally spaced along the path.
    `extra` (e.g. time) is interpolated at the same positions."""
    seg = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < 1e-9:
        rx = np.repeat(xy[:1], n, 0)
        return (rx, np.repeat(extra[:1], n)) if extra is not None else rx
    q = np.linspace(0, s[-1], n)
    rx = np.stack([np.interp(q, s, xy[:, 0]), np.interp(q, s, xy[:, 1])], 1)
    if extra is None:
        return rx
    return rx, np.interp(q, s, extra)


def sequence_features(arr: np.ndarray, n: int = N_POINTS) -> np.ndarray:
    """n x 6 features: x, y, unit direction (dx, dy), time fraction, slowness.

    Arc-length resampling makes the shape independent of drawing speed; the
    two time columns keep the speed information the GRU can use.
    """
    xy = fit_unit_box(arr[:, :2])
    t = arr[:, 2] - arr[0, 2]
    rxy, rt = resample_arclength(xy, n, t)
    d = np.diff(rxy, axis=0, prepend=rxy[:1])
    norm = np.linalg.norm(d, axis=1, keepdims=True)
    d = np.divide(d, norm, out=np.zeros_like(d), where=norm > 1e-9)
    total = rt[-1] if rt[-1] > 0 else 1.0
    tau = rt / total
    slow = np.diff(tau, prepend=0.0) * n  # 1.0 = average speed, >1 = slower
    return np.column_stack([rxy, d, tau, np.clip(slow, 0, 5)]).astype(np.float32)


def _to_px(xy: np.ndarray, size: int) -> np.ndarray:
    inner = size * (1 - 2 * _MARGIN)
    return (xy + 1) / 2 * inner + size * _MARGIN


def rasterize(arr_or_xy: np.ndarray, size: int = IMG_SIZE) -> np.ndarray:
    """Draw the path as a white-on-black image, float32 in [0, 1]."""
    xy = fit_unit_box(np.asarray(arr_or_xy)[:, :2])
    px = _to_px(xy, _RENDER)
    img = Image.new("L", (_RENDER, _RENDER), 0)
    draw = ImageDraw.Draw(img)
    pts = [tuple(p) for p in px]
    if len(pts) > 1:
        draw.line(pts, fill=255, width=_STROKE, joint="curve")
    r = _STROKE / 2
    for p in (pts[0], pts[-1]):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)
    img = img.resize((size, size), Image.BOX)
    return np.asarray(img, dtype=np.float32) / 255.0


def model_inputs(points, aspect: float | None = None, from_webcam: bool = True):
    """Convenience: raw points -> (image 1x64x64, sequence 64x6, cleaned array)."""
    arr = prepare(points, aspect, from_webcam)
    return rasterize(arr)[None], sequence_features(arr), arr


# --------------------------------------------------------------------------- images
def normalize_image(img, size: int = IMG_SIZE, skeleton: bool = True) -> np.ndarray | None:
    """Make a scanned/drawn image look like our rasterised trajectories.

    Steps: grayscale -> strokes bright on dark -> crop to the drawing -> pad to
    square (aspect kept, same margin as rasterize) -> thin to 1 px skeleton ->
    redraw at our stroke width -> downsample. Returns None for blank images.
    """
    from skimage.filters import threshold_otsu
    from scipy.ndimage import binary_dilation
    from skimage.morphology import disk, skeletonize

    a = np.asarray(img.convert("L") if isinstance(img, Image.Image) else img, dtype=np.float32)
    if a.ndim == 3:
        a = a.mean(-1)
    if a.max() > 1.5:
        a = a / 255.0
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    if np.median(border) > 0.5:  # dark strokes on light paper -> invert
        a = 1.0 - a
    if a.max() - a.min() < 0.1:
        return None
    mask = a > threshold_otsu(a)
    ys, xs = np.nonzero(mask)
    if len(xs) < 3:
        return None
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape
    side = max(h, w)
    sq = np.zeros((side, side), np.float32)
    sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = a
    inner = int(round(_RENDER * (1 - 2 * _MARGIN)))
    big = np.asarray(Image.fromarray((sq * 255).astype(np.uint8)).resize((inner, inner), Image.BILINEAR),
                     np.float32) / 255.0
    canvas = np.zeros((_RENDER, _RENDER), np.float32)
    off = (_RENDER - inner) // 2
    canvas[off:off + inner, off:off + inner] = big
    m = canvas > 0.5 * canvas.max()
    if skeleton:
        m = skeletonize(m)
        m = binary_dilation(m, structure=disk(_STROKE // 2))
    out = Image.fromarray((m * 255).astype(np.uint8)).resize((size, size), Image.BOX)
    return np.asarray(out, np.float32) / 255.0
