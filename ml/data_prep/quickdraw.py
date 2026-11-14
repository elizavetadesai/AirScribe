"""Quick, Draw! raw strokes -> AirScribe trajectories.

Source: Google Creative Lab, Quick, Draw! dataset (CC BY 4.0). We use the RAW
files because they keep timestamps (the simplified files drop them).

Mapping:
  circle, square, triangle -> same class
  line      -> hline or vline by angle (others discarded)
  squiggle  -> wave, only if it looks like a left-right wave
  star, lightning, cloud, moon, hurricane, envelope -> other

Strokes are joined into one continuous path, like air-writing (no pen lift).
Only drawings the game recognised are kept.

Usage (streams the first lines of each file, no full download needed):
    python data_prep/quickdraw.py --per-class 4000
Or with files you already downloaded (gsutil cp gs://quickdraw_dataset/full/raw/circle.ndjson .):
    python data_prep/quickdraw.py --local-dir path/to/ndjson
"""
from __future__ import annotations

import argparse
import io
import json
import urllib.request
from pathlib import Path

import numpy as np

from common import PROCESSED, preview_grid, print_counts, save_jsonl_gz  # noqa: E402
from airscribe_ml.preprocess import prepare, rasterize  # noqa: E402

URL = "https://storage.googleapis.com/quickdraw_dataset/full/raw/{}.ndjson"
DIRECT = {"circle": "circle", "square": "square", "triangle": "triangle"}
OTHER_CATS = ["star", "lightning", "cloud", "moon", "hurricane", "envelope"]


def _lines(cat: str, local_dir: Path | None):
    if local_dir:
        with open(local_dir / f"{cat}.ndjson", encoding="utf-8") as f:
            yield from f
        return
    with urllib.request.urlopen(URL.format(urllib.request.quote(cat))) as r:
        for line in io.TextIOWrapper(r, encoding="utf-8"):
            yield line


def join_strokes(drawing) -> np.ndarray:
    """[[xs, ys, ts], ...] -> N x 3, strokes concatenated in drawing order."""
    parts = [np.stack([np.asarray(s[0], float), np.asarray(s[1], float), np.asarray(s[2], float)], 1)
             for s in drawing if len(s) >= 3 and len(s[0]) > 0]
    if not parts:
        return np.zeros((0, 3))
    arr = np.vstack(parts)
    arr[:, 2] -= arr[0, 2]
    return arr


def _principal(xy):
    c = xy - xy.mean(0)
    w, v = np.linalg.eigh(np.cov(c.T) + 1e-9 * np.eye(2))
    major = v[:, 1]
    ang = np.degrees(np.arctan2(major[1], major[0])) % 180
    elong = np.sqrt(w[1] / max(w[0], 1e-9))
    return ang, elong


def classify_line(arr):
    ang, elong = _principal(arr[:, :2])
    if elong < 6:
        return None
    if ang < 20 or ang > 160:
        return "hline"
    if 70 < ang < 110:
        return "vline"
    return None


def looks_like_wave(arr):
    xy = arr[:, :2]
    ang, _ = _principal(xy)
    if not (ang < 25 or ang > 155):
        return False
    w, h = np.ptp(xy[:, 0]), np.ptp(xy[:, 1])
    if w < 1.8 * h or h < 0.08 * w:
        return False
    dx = np.diff(xy[:, 0])
    dx = dx[np.abs(dx) > 1e-6]
    if len(dx) == 0 or max((dx > 0).mean(), (dx < 0).mean()) < 0.85:
        return False
    y = np.convolve(xy[:, 1], np.ones(5) / 5, mode="valid")
    dy = np.sign(np.diff(y))
    dy = dy[dy != 0]
    turns = int(np.sum(dy[1:] != dy[:-1]))
    return 2 <= turns <= 10


def convert(cat: str, per_class: int, local_dir: Path | None, max_scan: int):
    out, scanned = {}, 0
    for line in _lines(cat, local_dir):
        scanned += 1
        if scanned > max_scan:
            break
        d = json.loads(line)
        if not d.get("recognized", False):
            continue
        arr = join_strokes(d["drawing"])
        if len(arr) < 10:
            continue
        if cat in DIRECT:
            label = DIRECT[cat]
        elif cat == "line":
            label = classify_line(arr)
        elif cat == "squiggle":
            label = "wave" if looks_like_wave(arr) else None
        else:
            label = "other"
        if label is None:
            continue
        try:
            prepare(arr.tolist(), from_webcam=False)  # same validity checks as live input
        except ValueError:
            continue
        out.setdefault(label, []).append({
            "label": label, "points": np.round(arr, 2).tolist(), "source": "quickdraw",
            "participant": f"QD-{d.get('countrycode', 'NA')}", "qd_category": cat,
        })
        need = ["hline", "vline"] if cat == "line" else [label]
        if all(len(out.get(k, [])) >= per_class for k in need):
            break
    print(f"  {cat}: scanned {scanned}, kept " + ", ".join(f"{k}={len(v)}" for k, v in out.items()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=4000)
    ap.add_argument("--local-dir", type=Path)
    ap.add_argument("--max-scan", type=int, default=200_000, help="lines to read per category at most")
    ap.add_argument("--out", type=Path, default=PROCESSED / "quickdraw.jsonl.gz")
    args = ap.parse_args()

    buckets: dict[str, list] = {}
    other_quota = max(1, args.per_class // len(OTHER_CATS))
    for cat in list(DIRECT) + ["line", "squiggle"] + OTHER_CATS:
        quota = other_quota if cat in OTHER_CATS else args.per_class
        for label, items in convert(cat, quota, args.local_dir, args.max_scan).items():
            buckets.setdefault(label, []).extend(items[:quota] if cat in OTHER_CATS else items[:args.per_class])
    samples = [s for v in buckets.values() for s in v]
    print_counts([s["label"] for s in samples], "Quick, Draw! samples")
    save_jsonl_gz(samples, args.out)
    pv = [s for lab in sorted(buckets) for s in buckets[lab][:8]]
    preview_grid([rasterize(np.asarray(s["points"])) for s in pv], [s["label"] for s in pv],
                 args.out.with_suffix("").with_suffix(".preview.png"))


if __name__ == "__main__":
    main()
