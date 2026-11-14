"""Shared helpers for the data-prep scripts.

Unified formats (everything in data/processed/):
  * trajectory sets: <name>.jsonl.gz, one JSON object per line:
      {"label": "circle", "points": [[x, y, t_ms], ...], "source": "...",
       "participant": "P01", "hand": "right"}
    Points are in the USER's view (not mirrored), equal units on both axes.
  * image sets: <name>.npz with arrays
      images (N, 64, 64) uint8, labels (N,) str, source (N,) str, group (N,) str
"""
from __future__ import annotations

import gzip
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PROCESSED = ROOT / "data" / "processed"


def save_jsonl_gz(samples, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, separators=(",", ":")) + "\n")
    print(f"saved {len(samples)} samples -> {path}")


def load_jsonl_gz(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def save_images(images, labels, path: Path, source: str, groups=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    imgs = (np.clip(np.asarray(images), 0, 1) * 255).astype(np.uint8)
    labels = np.asarray(labels)
    groups = np.asarray(groups if groups is not None else [source] * len(labels))
    np.savez_compressed(path, images=imgs, labels=labels,
                        source=np.asarray([source] * len(labels)), group=groups)
    print(f"saved {len(labels)} images -> {path}")


def print_counts(labels, title="counts"):
    c = Counter(labels)
    print(f"{title}: " + ", ".join(f"{k}={v}" for k, v in sorted(c.items())))


def preview_grid(images, labels, path: Path, per_class: int = 8):
    """Save a PNG with a few examples per class so you can eyeball the data
    (orientation, inversion, stroke width) before training."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    labels = list(labels)
    classes = sorted(set(labels))
    fig, axes = plt.subplots(len(classes), per_class, figsize=(per_class * 0.9, len(classes) * 1.0))
    axes = np.atleast_2d(axes)
    for r, c in enumerate(classes):
        idx = [i for i, l in enumerate(labels) if l == c][:per_class]
        for k in range(per_class):
            ax = axes[r, k]
            ax.axis("off")
            if k < len(idx):
                ax.imshow(images[idx[k]], cmap="gray", vmin=0, vmax=1)
        axes[r, 0].set_title(c, fontsize=7, loc="left")
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)
    print(f"preview -> {path}")
