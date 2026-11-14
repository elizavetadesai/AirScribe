"""Train AirScribeNet.

Three stages (see run_experiments.sh for the exact commands):

  1. pretrain the CNN on images  (hand-drawn shapes, letters, rendered Quick, Draw!/synthetic)
       python train.py --mode cnn --images data/processed/hds.npz data/processed/letters.npz \
           --traj data/processed/quickdraw.jsonl.gz data/processed/synthetic.jsonl.gz --name pre_cnn
  2. pretrain the GRU on trajectories (Quick, Draw!, synthetic)
       python train.py --mode gru --traj data/processed/quickdraw.jsonl.gz data/processed/synthetic.jsonl.gz --name pre_gru
  3. fine-tune on your own recordings, split by person
       python train.py --mode fusion --own data/processed/own.jsonl.gz \
           --traj data/processed/synthetic.jsonl.gz:0.3 --init runs/pre_cnn/best.pt runs/pre_gru/best.pt \
           --test-people P07,P08 --val-people P06 --name fusion

`--traj path:w` gives that source sampling weight w relative to own data (1.0).
Test people are removed here and only used by evaluate.py.
"""
from __future__ import annotations

import argparse
import csv
import json
import time
from contextlib import nullcontext
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import ConcatDataset, DataLoader, WeightedRandomSampler

from airscribe_ml.classes import CLASSES, NUM_CLASSES
from airscribe_ml.data import (ImageSet, TrajectorySet, balanced_weights, load_jsonl_gz,
                               random_split, split_people)
from airscribe_ml.model import AirScribeNet, augment_images, count_params


def parse_weighted(items):
    out = []
    for it in items or []:
        path, _, w = it.partition(":")
        out.append((path, float(w) if w else 1.0))
    return out


def device_auto():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def macro_f1(y_true, y_pred, n=NUM_CLASSES):
    f1s = []
    for c in range(n):
        tp = np.sum((y_pred == c) & (y_true == c))
        fp = np.sum((y_pred == c) & (y_true != c))
        fn = np.sum((y_pred != c) & (y_true == c))
        if tp + fn == 0:
            continue  # class absent from this split
        f1s.append(2 * tp / max(2 * tp + fp + fn, 1))
    return float(np.mean(f1s)) if f1s else 0.0


@torch.no_grad()
def run_eval(model, loader, device, crit):
    model.eval()
    ys, ps, loss_sum, n = [], [], 0.0, 0
    for img, seq, y in loader:
        img, seq, y = img.to(device), seq.to(device), y.to(device)
        logits = model(img, seq)
        loss_sum += crit(logits, y).item() * len(y)
        n += len(y)
        ys.append(y.cpu().numpy())
        ps.append(logits.argmax(1).cpu().numpy())
    if n == 0:
        return {"loss": float("nan"), "acc": float("nan"), "f1": float("nan")}
    y, p = np.concatenate(ys), np.concatenate(ps)
    return {"loss": loss_sum / n, "acc": float((y == p).mean()), "f1": macro_f1(y, p)}


def build_sets(args):
    test_people = {p.strip().upper() for p in args.test_people.split(",") if p.strip()}
    val_people = {p.strip().upper() for p in args.val_people.split(",") if p.strip()}
    train_parts, val_parts, source_w = [], [], {}

    if args.own:
        own = load_jsonl_gz(args.own)
        tr, va, te = split_people(own, test_people, val_people)
        print(f"own recordings: train {len(tr)}, val {len(va)}, test {len(te)} (held out, not used here)")
        if not va:
            print("  WARNING: no --val-people given; using 15% of own training samples as validation "
                  "(optimistic, because the same people appear in train and val)")
            idx_tr, idx_va = random_split(len(tr), 0.15, args.seed)
            va = [tr[i] for i in idx_va]
            tr = [tr[i] for i in idx_tr]
        train_parts.append(TrajectorySet(tr, augment=True))
        val_parts.append(TrajectorySet(va))
        source_w["own"] = 1.0

    for path, w in parse_weighted(args.traj):
        samples = load_jsonl_gz(path)
        idx_tr, idx_va = random_split(len(samples), args.public_val, args.seed)
        tr = TrajectorySet([samples[i] for i in idx_tr], augment=True)
        train_parts.append(tr)
        if not args.own:  # public data only validates when there are no own recordings
            val_parts.append(TrajectorySet([samples[i] for i in idx_va]))
        for s in set(tr.sources):
            source_w[s] = w
        print(f"{path}: {len(tr)} train trajectories (weight {w}, skipped {tr.skipped})")

    if args.images:
        if args.mode != "cnn":
            print("note: --images ignored (image-only data has no movement sequence, CNN mode only)")
        else:
            for path, w in parse_weighted(args.images):
                full = ImageSet([path])
                idx_tr, idx_va = random_split(len(full), args.public_val, args.seed)
                tr = ImageSet([path], idx_tr)
                train_parts.append(tr)
                if not args.own:
                    val_parts.append(ImageSet([path], idx_va))
                for s in set(tr.sources):
                    source_w[s] = w
                print(f"{path}: {len(tr)} train images (weight {w})")

    if not train_parts:
        raise SystemExit("No training data given.")
    if not val_parts:
        raise SystemExit("No validation data. Give --val-people or public data.")
    labels = sum((list(p.labels) for p in train_parts), [])
    sources = sum((list(p.sources) for p in train_parts), [])
    return ConcatDataset(train_parts), ConcatDataset(val_parts), labels, sources, source_w, test_people, val_people


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", choices=["cnn", "gru", "fusion"], required=True)
    ap.add_argument("--own", help="own recordings jsonl.gz (split by person)")
    ap.add_argument("--traj", nargs="*", help="trajectory sets, optional :weight")
    ap.add_argument("--images", nargs="*", help="image sets (.npz), cnn mode only")
    ap.add_argument("--init", nargs="*", default=[], help="checkpoints to copy cnn/gru branch weights from")
    ap.add_argument("--test-people", default="")
    ap.add_argument("--val-people", default="")
    ap.add_argument("--public-val", type=float, default=0.1)
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--steps-per-epoch", type=int, default=0, help="0 = one pass over the data")
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--patience", type=int, default=8)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", default="runs")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    out = Path(args.out) / args.name
    out.mkdir(parents=True, exist_ok=True)
    device = device_auto()

    train_set, val_set, labels, sources, source_w, test_people, val_people = build_sets(args)
    weights = balanced_weights(labels, sources, source_w)
    steps = args.steps_per_epoch or max(1, len(train_set) // args.batch)
    sampler = WeightedRandomSampler(torch.as_tensor(weights), num_samples=steps * args.batch, replacement=True)
    train_dl = DataLoader(train_set, batch_size=args.batch, sampler=sampler, num_workers=args.workers,
                          pin_memory=device.type == "cuda", persistent_workers=args.workers > 0)
    val_dl = DataLoader(val_set, batch_size=256, num_workers=args.workers)

    model = AirScribeNet(args.mode).to(device)
    if args.init:
        print("initialised branches from pretraining:", model.load_branches(args.init))
    print(f"mode={args.mode} params={count_params(model):,} device={device} "
          f"train={len(train_set)} val={len(val_set)} steps/epoch={steps}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.epochs * steps,
                                                pct_start=0.15)
    crit = nn.CrossEntropyLoss(label_smoothing=0.05)
    use_amp = device.type == "cuda"
    try:  # PyTorch >= 2.3
        scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    except AttributeError:  # PyTorch 2.2 and older
        scaler = torch.cuda.amp.GradScaler(enabled=use_amp)

    history, best, bad_epochs = [], -1.0, 0
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, tl, tc, tn = time.time(), 0.0, 0, 0
        for img, seq, y in train_dl:
            img, seq, y = img.to(device, non_blocking=True), seq.to(device, non_blocking=True), y.to(device)
            img = augment_images(img)
            amp_ctx = torch.autocast(device_type="cuda", dtype=torch.float16) if use_amp else nullcontext()
            with amp_ctx:
                logits = model(img, seq)
                loss = crit(logits, y)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            scaler.step(opt)
            scaler.update()
            sched.step()
            tl += loss.item() * len(y)
            tc += (logits.argmax(1) == y).sum().item()
            tn += len(y)
        val = run_eval(model, val_dl, device, crit)
        row = {"epoch": epoch, "train_loss": tl / tn, "train_acc": tc / tn, "val_loss": val["loss"],
               "val_acc": val["acc"], "val_f1": val["f1"], "lr": sched.get_last_lr()[0],
               "seconds": round(time.time() - t0, 1)}
        history.append(row)
        print(f"epoch {epoch:3d}  loss {row['train_loss']:.3f}  acc {row['train_acc']:.3f}  |  "
              f"val loss {val['loss']:.3f}  acc {val['acc']:.3f}  macroF1 {val['f1']:.3f}  ({row['seconds']}s)")

        ckpt = {"model": model.state_dict(), "mode": args.mode, "classes": CLASSES,
                "epoch": epoch, "val": val, "args": vars(args),
                "test_people": sorted(test_people), "val_people": sorted(val_people)}
        torch.save(ckpt, out / "last.pt")
        score = val["f1"] if np.isfinite(val["f1"]) else -row["train_loss"]
        if score > best:
            best, bad_epochs = score, 0
            torch.save(ckpt, out / "best.pt")
        else:
            bad_epochs += 1
            if bad_epochs >= args.patience:
                print(f"early stop: no val improvement for {args.patience} epochs")
                break

    with open(out / "history.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(history[0]))
        w.writeheader()
        w.writerows(history)
    (out / "summary.json").write_text(json.dumps({"best_val_f1": best, "epochs": len(history),
                                                  "params": count_params(model), "args": vars(args)}, indent=2))
    plot_history(history, out / "curves.png", args.name)
    print(f"done. best val macro-F1 {best:.3f}. checkpoint: {out / 'best.pt'}")


def plot_history(history, path, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    e = [h["epoch"] for h in history]
    fig, ax = plt.subplots(1, 2, figsize=(9, 3.2))
    ax[0].plot(e, [h["train_loss"] for h in history], label="train")
    ax[0].plot(e, [h["val_loss"] for h in history], label="val")
    ax[0].set_title("loss")
    ax[1].plot(e, [h["train_acc"] for h in history], label="train acc")
    ax[1].plot(e, [h["val_acc"] for h in history], label="val acc")
    ax[1].plot(e, [h["val_f1"] for h in history], label="val macro-F1")
    ax[1].set_ylim(0, 1)
    ax[1].set_title("accuracy")
    for a in ax:
        a.set_xlabel("epoch")
        a.legend(fontsize=8)
    fig.suptitle(title)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


if __name__ == "__main__":
    main()
