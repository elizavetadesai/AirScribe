"""Merge JSON files from the data-collection page into one dataset.

Accepts the files downloaded from the React app's /collect page and from the
older collect.html (both are lists of
{participant, label, hand, fps, created, points: [[x, y, t_ms], ...], aspect?}).

What it does:
  * converts webcam coordinates to the user's view (un-mirror, fix aspect)
  * drops samples that fail the same checks the live app uses
  * removes exact duplicates (e.g. the same file merged twice)
  * renames old labels with --alias (e.g. --alias O=circle)
  * prints a participant x class table for the dataset section of the report

Usage:
    python data_prep/own_recordings.py recordings/*.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from common import PROCESSED, preview_grid, save_jsonl_gz  # noqa: E402
from airscribe_ml.classes import CLASSES  # noqa: E402
from airscribe_ml.preprocess import TrajectoryError, clean_points, prepare, rasterize, webcam_to_user  # noqa: E402


def load_any(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("samples", [])
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--alias", action="append", default=[], help="OLD=new label rename")
    ap.add_argument("--default-aspect", type=float, default=16 / 9,
                    help="frame width/height for samples recorded without 'aspect'")
    ap.add_argument("--out", type=Path, default=PROCESSED / "own.jsonl.gz")
    args = ap.parse_args()
    alias = dict(a.split("=", 1) for a in args.alias)

    seen, out, dropped = set(), [], defaultdict(int)
    for f in args.files:
        for s in load_any(f):
            label = alias.get(s.get("label"), s.get("label"))
            if label not in CLASSES:
                dropped[f"unknown label {s.get('label')}"] += 1
                continue
            key = hashlib.md5(json.dumps(s.get("points")).encode()).hexdigest()
            if key in seen:
                dropped["duplicate"] += 1
                continue
            seen.add(key)
            aspect = s.get("aspect") or args.default_aspect
            try:
                prepare(s["points"], aspect=aspect, from_webcam=True)
                user = webcam_to_user(clean_points(s["points"]), aspect)
            except (TrajectoryError, KeyError, ValueError) as e:
                dropped[f"invalid: {str(e)[:40]}"] += 1
                continue
            out.append({
                "label": label, "points": np.round(user, 5).tolist(), "source": "own",
                "participant": str(s.get("participant", "unknown")).strip().upper(),
                "hand": s.get("hand", "unknown"), "created": s.get("created"),
            })

    if not out:
        raise SystemExit("No usable samples.")
    people = sorted({s["participant"] for s in out})
    labels = [c for c in CLASSES if any(s["label"] == c for s in out)]
    table = defaultdict(lambda: defaultdict(int))
    for s in out:
        table[s["participant"]][s["label"]] += 1
    print("\nparticipant  " + " ".join(f"{c[:6]:>6s}" for c in labels) + "  total")
    for p in people:
        row = [table[p][c] for c in labels]
        print(f"{p:11s}  " + " ".join(f"{n:6d}" for n in row) + f"  {sum(row):5d}")
    print(f"\n{len(out)} samples from {len(people)} people")
    for k, v in dropped.items():
        print(f"dropped {v}: {k}")
    save_jsonl_gz(out, args.out)
    pv = [s for c in labels for s in [x for x in out if x["label"] == c][:8]]
    preview_grid([rasterize(np.asarray(s["points"])) for s in pv], [s["label"] for s in pv],
                 args.out.with_suffix("").with_suffix(".preview.png"))


if __name__ == "__main__":
    main()
