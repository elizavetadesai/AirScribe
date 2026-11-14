"""PyTorch datasets for training (not used by the backend)."""
from __future__ import annotations

import gzip
import json
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from .classes import CLASS_TO_IDX
from .preprocess import N_FEATURES, N_POINTS, TrajectoryError, prepare, rasterize, sequence_features


def load_jsonl_gz(path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def augment_traj(arr: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Random but label-preserving changes to a cleaned trajectory."""
    a = arr.copy()
    n = len(a)
    # trim a little at the ends and drop a few frames
    lo = rng.integers(0, max(1, int(0.04 * n)))
    hi = n - rng.integers(0, max(1, int(0.04 * n)))
    a = a[lo:hi]
    if len(a) > 20:
        keep = rng.random(len(a)) > rng.uniform(0, 0.1)
        keep[0] = keep[-1] = True
        a = a[keep]
    # geometry: small rotation, uneven scale, shear
    xy = a[:, :2] - a[:, :2].mean(0)
    ang = np.deg2rad(rng.normal(0, 5))
    rot = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
    m = rot @ np.array([[rng.uniform(0.9, 1.1), rng.normal(0, 0.04)], [0, rng.uniform(0.9, 1.1)]])
    xy = xy @ m.T
    extent = float(max(np.ptp(xy, 0))) or 1.0
    xy += rng.normal(0, 0.004 * extent, xy.shape)
    # time warp: same path, different speed pattern
    t = a[:, 2] - a[0, 2]
    total = t[-1] if t[-1] > 0 else 1.0
    t = total * (t / total) ** rng.uniform(0.8, 1.25) * rng.uniform(0.8, 1.25)
    return np.column_stack([xy, t])


class TrajectorySet(Dataset):
    """Trajectories -> (image, sequence, label). Used by all three modes."""

    def __init__(self, samples: list[dict], augment: bool = False):
        self.arrs, self.labels, self.sources, self.people = [], [], [], []
        skipped = 0
        for s in samples:
            if s["label"] not in CLASS_TO_IDX:
                skipped += 1
                continue
            try:
                arr = prepare(s["points"], from_webcam=False)
            except (TrajectoryError, ValueError):
                skipped += 1
                continue
            self.arrs.append(arr.astype(np.float32))
            self.labels.append(CLASS_TO_IDX[s["label"]])
            self.sources.append(s.get("source", "?"))
            self.people.append(s.get("participant", "?"))
        self.augment = augment
        self.skipped = skipped

    def __len__(self):
        return len(self.arrs)

    def __getitem__(self, i):
        arr = self.arrs[i]
        if self.augment:
            rng = np.random.default_rng(int(torch.randint(0, 2 ** 31 - 1, (1,)).item()))
            try:
                aug = augment_traj(arr, rng)
                prepare(aug, from_webcam=False)  # still a valid drawing?
                arr = aug
            except (TrajectoryError, ValueError):
                pass
        img = rasterize(arr)[None]
        seq = sequence_features(arr)
        return torch.from_numpy(img), torch.from_numpy(seq), self.labels[i]


class ImageSet(Dataset):
    """Image-only datasets (HDS, letters). Sequence is zeros: CNN mode only."""

    def __init__(self, npz_paths: list[str | Path], index: np.ndarray | None = None):
        imgs, labels, srcs, groups = [], [], [], []
        for p in npz_paths:
            d = np.load(p, allow_pickle=False)
            keep = np.array([lab in CLASS_TO_IDX for lab in d["labels"]])
            imgs.append(d["images"][keep])
            labels += [CLASS_TO_IDX[lab] for lab in d["labels"][keep]]
            srcs += list(d["source"][keep])
            groups += list(d["group"][keep])
        self.images = np.concatenate(imgs) if imgs else np.zeros((0, 64, 64), np.uint8)
        self.labels, self.sources, self.people = labels, srcs, groups
        if index is not None:
            self.images = self.images[index]
            self.labels = [self.labels[i] for i in index]
            self.sources = [self.sources[i] for i in index]
            self.people = [self.people[i] for i in index]
        self._zero_seq = torch.zeros(N_POINTS, N_FEATURES)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, i):
        img = torch.from_numpy(self.images[i].astype(np.float32) / 255.0)[None]
        return img, self._zero_seq, self.labels[i]


def balanced_weights(labels, sources, source_weight: dict[str, float] | None = None) -> np.ndarray:
    """Sampling weight so every (source, class) pair is equally likely, scaled
    by a per-source weight (e.g. own recordings count more than public data)."""
    source_weight = source_weight or {}
    pair = Counter(zip(sources, labels))
    per_source_classes = Counter(s for s, _ in pair)
    w = np.array([source_weight.get(s, 1.0) / (pair[(s, y)] * per_source_classes[s])
                  for s, y in zip(sources, labels)], dtype=np.float64)
    return w / w.sum()


def split_people(samples: list[dict], test_people: set[str], val_people: set[str]):
    train, val, test = [], [], []
    for s in samples:
        p = str(s.get("participant", "")).upper()
        (test if p in test_people else val if p in val_people else train).append(s)
    return train, val, test


def random_split(n: int, val_frac: float, seed: int):
    rng = np.random.default_rng(seed)
    idx = rng.permutation(n)
    k = int(round(n * val_frac))
    return idx[k:], idx[:k]
