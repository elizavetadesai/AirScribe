"""Hand-drawn shapes dataset (HDS) -> 64x64 images for CNN pretraining.

Source: F. Robert, hand-drawn-shapes-dataset, CC BY 4.0
        https://github.com/frobertpixto/hand-drawn-shapes-dataset
Get it:  git clone https://github.com/frobertpixto/hand-drawn-shapes-dataset

Class mapping: ellipse -> circle, rectangle -> square, triangle -> triangle,
other -> other. (HDS rectangles include non-square rectangles; we accept that
and mention it in the report.)

The label is taken from the folder or file name (any path part containing
"ellipse", "rectangle", "triangle" or "other"), so the script does not depend
on the exact folder layout. The folder above the class folder is kept as a
"group" (usually the person who drew it) for an honest train/val split.

Usage:
    python data_prep/hand_drawn_shapes.py --src hand-drawn-shapes-dataset
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from common import PROCESSED, preview_grid, print_counts, save_images  # noqa: E402
from airscribe_ml.preprocess import normalize_image  # noqa: E402

MAP = {"ellipse": "circle", "rectangle": "square", "triangle": "triangle", "other": "other"}


GENERIC = {"images", "image", "data", "train", "test", "val", "valid", "png", "img", "dataset"}


def label_of(path: Path):
    parts = path.parts
    for idx in range(len(parts) - 1, -1, -1):
        name = parts[idx].lower() if idx < len(parts) - 1 else path.stem.lower()
        for key, lab in MAP.items():
            if key in name:
                group = next((parts[j] for j in range(idx - 1, -1, -1)
                              if parts[j].lower() not in GENERIC), "HDS")
                return lab, group
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--max-per-class", type=int, default=6000)
    ap.add_argument("--out", type=Path, default=PROCESSED / "hds.npz")
    args = ap.parse_args()

    files = sorted(p for p in args.src.rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    images, labels, groups, counts, skipped = [], [], [], {}, 0
    for f in files:
        lab, group = label_of(f.relative_to(args.src))
        if lab is None or counts.get(lab, 0) >= args.max_per_class:
            continue
        img = normalize_image(Image.open(f))
        if img is None:
            skipped += 1
            continue
        images.append(img)
        labels.append(lab)
        groups.append(f"HDS-{group}")
        counts[lab] = counts.get(lab, 0) + 1
    if not images:
        raise SystemExit(f"No labelled images found under {args.src}. Check the path.")
    print(f"found {len(files)} image files, used {len(images)}, skipped {skipped} blank")
    print_counts(labels, "HDS")
    save_images(images, labels, args.out, "hds", groups)
    preview_grid(images, labels, args.out.with_suffix(".preview.png"))


if __name__ == "__main__":
    main()
