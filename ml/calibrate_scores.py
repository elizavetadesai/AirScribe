"""Set the 0-100 smoothness scale from real recordings.

    python calibrate_scores.py --own data/processed/own.jsonl.gz --exclude P07,P08
    python calibrate_scores.py --synthetic 200          # reproduce the built-in defaults

Writes models/score_bounds.json. Pass it to export_onnx.py (--bounds) so the
backend uses it. Exclude your test people so the scale is not fitted on them.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from airscribe_ml.preprocess import TrajectoryError, prepare
from airscribe_ml.scoring import calibrate_smoothness, smoothness


def load_jsonl_gz(path):
    import gzip
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--own")
    g.add_argument("--synthetic", type=int)
    ap.add_argument("--exclude", default="")
    ap.add_argument("--out", type=Path, default=Path("models/score_bounds.json"))
    args = ap.parse_args()

    by_class = defaultdict(list)
    if args.own:
        skip = {p.strip().upper() for p in args.exclude.split(",") if p.strip()}
        for s in load_jsonl_gz(args.own):
            if str(s.get("participant", "")).upper() in skip:
                continue
            try:
                by_class[s["label"]].append(prepare(s["points"], from_webcam=False))
            except (TrajectoryError, ValueError):
                pass
    else:
        from airscribe_ml.synthetic import synth_trajectory
        rng = np.random.default_rng(0)
        from airscribe_ml.classes import CLASSES
        for c in CLASSES:
            by_class[c] = [prepare(synth_trajectory(c, rng, "normal"), from_webcam=False)
                           for _ in range(args.synthetic)]

    table = calibrate_smoothness(by_class)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(table, indent=2))
    print(f"wrote {args.out}")
    print("check: median smoothness score per class with the new scale")
    for c, arrs in sorted(by_class.items()):
        sc = [smoothness(a, c, table)["score"] for a in arrs[:200]]
        print(f"  {c:9s} n={len(arrs):4d}  median score {np.median(sc):5.1f}")


if __name__ == "__main__":
    main()
