"""Evaluate a checkpoint on held-out people (the numbers for the report).

    python evaluate.py runs/fusion/best.pt --own data/processed/own.jsonl.gz

Uses the test people stored in the checkpoint (or --people P07,P08). Writes to
runs/<name>/eval/:
  metrics.json          accuracy, macro-F1, per-class and per-person results, latency
  confusion.png         confusion matrix (row-normalised)
  errors.png            misclassified drawings with true/predicted labels
and appends one row to results/summary.md (the ablation table).

--traj evaluates on another trajectory file instead (e.g. to show the gap
between Quick, Draw! accuracy and real air-writing accuracy).
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch

from airscribe_ml.classes import CLASSES
from airscribe_ml.data import TrajectorySet, load_jsonl_gz
from airscribe_ml.model import AirScribeNet, count_params
from airscribe_ml.preprocess import model_inputs


def per_class(y, p):
    rows = {}
    for c, name in enumerate(CLASSES):
        tp = int(np.sum((p == c) & (y == c)))
        fp = int(np.sum((p == c) & (y != c)))
        fn = int(np.sum((p != c) & (y == c)))
        if tp + fn == 0:
            continue
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn)
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        rows[name] = {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(f1, 3), "n": tp + fn}
    return rows


def plot_confusion(y, p, path, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    present = sorted(set(y.tolist()) | set(p.tolist()))
    names = [CLASSES[i] for i in present]
    m = np.zeros((len(present), len(present)))
    for a, b in zip(y, p):
        m[present.index(a), present.index(b)] += 1
    norm = m / np.maximum(m.sum(1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    ax.imshow(norm, cmap="Greens", vmin=0, vmax=1)
    for i in range(len(present)):
        for j in range(len(present)):
            if m[i, j]:
                ax.text(j, i, int(m[i, j]), ha="center", va="center", fontsize=7,
                        color="white" if norm[i, j] > 0.6 else "black")
    ax.set_xticks(range(len(names)), names, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(names)), names, fontsize=8)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_errors(ds, y, p, path, limit=24):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    wrong = np.nonzero(y != p)[0][:limit]
    if len(wrong) == 0:
        return
    cols = 8
    rows = int(np.ceil(len(wrong) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 1.2, rows * 1.4))
    for ax in np.atleast_1d(axes).ravel():
        ax.axis("off")
    for ax, i in zip(np.atleast_1d(axes).ravel(), wrong):
        img, _, _ = ds[i]
        ax.imshow(img[0].numpy(), cmap="gray")
        ax.set_title(f"{CLASSES[y[i]]}->{CLASSES[p[i]]}", fontsize=6)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def measure_latency(model, samples, n=100):
    """End-to-end CPU time per attempt: preprocessing + rendering + model."""
    model = model.cpu().eval()
    times = []
    with torch.no_grad():
        for s in samples[:n]:
            t0 = time.perf_counter()
            img, seq, _ = model_inputs(s["points"], from_webcam=False)
            model(torch.from_numpy(img)[None], torch.from_numpy(seq)[None])
            times.append((time.perf_counter() - t0) * 1000)
    return {"median_ms": round(float(np.median(times)), 2), "p95_ms": round(float(np.percentile(times, 95)), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ckpt")
    ap.add_argument("--own", help="own recordings; evaluates on the checkpoint's test people")
    ap.add_argument("--people", default="", help="override test people, e.g. P07,P08")
    ap.add_argument("--traj", help="evaluate on all samples of this file instead")
    ap.add_argument("--label", default="", help="row label for results/summary.md")
    args = ap.parse_args()

    ck = torch.load(args.ckpt, map_location="cpu", weights_only=False)
    model = AirScribeNet(ck["mode"])
    model.load_state_dict(ck["model"])
    model.eval()
    name = Path(args.ckpt).parent.name

    if args.traj:
        samples = load_jsonl_gz(args.traj)
        where = Path(args.traj).name
    else:
        people = {p.strip().upper() for p in (args.people or ",".join(ck.get("test_people", []))).split(",")
                  if p.strip()}
        if not people:
            raise SystemExit("No test people: pass --people or train with --test-people")
        samples = [s for s in load_jsonl_gz(args.own) if str(s.get("participant", "")).upper() in people]
        where = "held-out people " + ",".join(sorted(people))
    ds = TrajectorySet(samples)
    if len(ds) == 0:
        raise SystemExit("No usable test samples.")

    ys, ps, confs = [], [], []
    with torch.no_grad():
        for i in range(0, len(ds), 256):
            batch = [ds[j] for j in range(i, min(i + 256, len(ds)))]
            img = torch.stack([b[0] for b in batch])
            seq = torch.stack([b[1] for b in batch])
            prob = torch.softmax(model(img, seq), 1)
            confs.append(prob.max(1).values.numpy())
            ps.append(prob.argmax(1).numpy())
            ys.append(np.array([b[2] for b in batch]))
    y, p = np.concatenate(ys), np.concatenate(ps)

    by_person = defaultdict(list)
    for person, a, b in zip(ds.people, y, p):
        by_person[person].append(a == b)
    pc = per_class(y, p)
    metrics = {
        "checkpoint": args.ckpt, "mode": ck["mode"], "evaluated_on": where, "n": int(len(y)),
        "accuracy": round(float((y == p).mean()), 4),
        "macro_f1": round(float(np.mean([r["f1"] for r in pc.values()])), 4),
        "per_class": pc,
        "per_person_accuracy": {k: round(float(np.mean(v)), 3) for k, v in sorted(by_person.items())},
        "mean_confidence_correct": round(float(np.concatenate(confs)[y == p].mean()), 3) if (y == p).any() else None,
        "params": count_params(model),
        "latency_cpu": measure_latency(model, samples),
    }
    out = Path(args.ckpt).parent / "eval" / (Path(args.traj).stem if args.traj else "test")
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    plot_confusion(y, p, out / "confusion.png", f"{name} on {where}")
    plot_errors(ds, y, p, out / "errors.png")
    print(json.dumps({k: v for k, v in metrics.items() if k != "per_class"}, indent=2))

    summary = Path("results") / "summary.md"
    summary.parent.mkdir(exist_ok=True)
    if not summary.exists():
        summary.write_text("| run | mode | evaluated on | n | accuracy | macro-F1 | params | CPU latency (median ms) |\n"
                           "|---|---|---|---|---|---|---|---|\n")
    with open(summary, "a") as f:
        f.write(f"| {args.label or name} | {ck['mode']} | {where} | {metrics['n']} | {metrics['accuracy']:.3f} | "
                f"{metrics['macro_f1']:.3f} | {metrics['params']:,} | {metrics['latency_cpu']['median_ms']} |\n")
    print(f"saved -> {out}  and appended a row to {summary}")


if __name__ == "__main__":
    main()
