"""Handwritten A-Z letters -> 64x64 images for CNN pretraining (L, T, S, A only).

Two ways to load the same data:
  --hf    Hugging Face "pittawat/letter_recognition" (needs `pip install datasets`)
  --csv   Kaggle "A-Z Handwritten Alphabets in .csv format" (A_Z Handwritten Data.csv:
          first column = label 0-25, then 784 pixel values of a 28x28 image)

The Hugging Face card says it was generated from that Kaggle CSV. Neither page
states a licence clearly, so cite the original Kaggle dataset in the report and
check its licence before redistributing anything.

ALWAYS open the preview PNG after running. Some letter datasets are stored
transposed or mirrored (EMNIST is). If letters look sideways use --transpose,
if mirrored use --flip.

Usage:
    python data_prep/letters.py --hf
    python data_prep/letters.py --csv "A_Z Handwritten Data.csv"
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from common import PROCESSED, preview_grid, print_counts, save_images  # noqa: E402
from airscribe_ml.classes import LETTERS  # noqa: E402
from airscribe_ml.preprocess import normalize_image  # noqa: E402


def from_csv(path: Path):
    import pandas as pd
    for chunk in pd.read_csv(path, header=None, chunksize=20000):
        arr = chunk.to_numpy()
        for row in arr:
            yield chr(65 + int(row[0])), row[1:].reshape(28, 28).astype(np.float32)


def from_hf(name: str):
    from datasets import load_dataset
    ds = load_dataset(name)
    for split in ds:
        feat = ds[split].features.get("label")
        names = getattr(feat, "names", None)
        img_key = "image" if "image" in ds[split].features else list(ds[split].features)[0]
        for ex in ds[split]:
            lab = ex["label"]
            letter = names[lab] if names else (chr(65 + int(lab)) if isinstance(lab, int) else str(lab))
            yield letter.strip().upper()[:1], np.asarray(ex[img_key].convert("L"), np.float32)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--hf", nargs="?", const="pittawat/letter_recognition")
    g.add_argument("--csv", type=Path)
    ap.add_argument("--per-class", type=int, default=3000)
    ap.add_argument("--transpose", action="store_true")
    ap.add_argument("--flip", action="store_true")
    ap.add_argument("--out", type=Path, default=PROCESSED / "letters.npz")
    args = ap.parse_args()

    src = from_csv(args.csv) if args.csv else from_hf(args.hf)
    images, labels, counts = [], [], {k: 0 for k in LETTERS}
    for letter, img in src:
        if letter not in counts or counts[letter] >= args.per_class:
            if all(v >= args.per_class for v in counts.values()):
                break
            continue
        if args.transpose:
            img = img.T
        if args.flip:
            img = img[:, ::-1]
        out = normalize_image(img)
        if out is None:
            continue
        images.append(out)
        labels.append(letter)
        counts[letter] += 1
    print_counts(labels, "letters")
    save_images(images, labels, args.out, "letters")
    preview_grid(images, labels, args.out.with_suffix(".preview.png"))


if __name__ == "__main__":
    main()
