"""Generate synthetic air-drawing trajectories for every class.

Usage:
    python data_prep/make_synthetic.py --per-class 3000
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from common import PROCESSED, preview_grid, print_counts, save_jsonl_gz  # noqa: E402
from airscribe_ml.preprocess import rasterize  # noqa: E402
from airscribe_ml.synthetic import synth_dataset  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=PROCESSED / "synthetic.jsonl.gz")
    args = ap.parse_args()
    samples = synth_dataset(args.per_class, args.seed)
    print_counts([s["label"] for s in samples], "synthetic")
    save_jsonl_gz(samples, args.out)
    pv = [s for i, s in enumerate(samples) if i % args.per_class < 8]
    preview_grid([rasterize(np.asarray(s["points"])) for s in pv], [s["label"] for s in pv],
                 args.out.with_suffix("").with_suffix(".preview.png"))


if __name__ == "__main__":
    main()
