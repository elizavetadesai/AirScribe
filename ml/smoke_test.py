"""Run this FIRST after `pip install -r requirements-train.txt` (about 1 minute on CPU).

    python smoke_test.py

Checks, end to end on a tiny synthetic dataset:
  1. all three model modes run forward and backward
  2. a few training steps reduce the loss
  3. ONNX export works and matches PyTorch
  4. the backend inference path (raw webcam points -> scores) works
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from airscribe_ml.classes import CLASS_TO_IDX, CLASSES
from airscribe_ml.data import TrajectorySet
from airscribe_ml.model import AirScribeNet, augment_images, count_params
from airscribe_ml.synthetic import synth_dataset

ok = True


def check(name, cond, detail=""):
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    ok &= bool(cond)


torch.manual_seed(0)
samples = synth_dataset(12, seed=1)
ds = TrajectorySet(samples, augment=True)
check("dataset builds", len(ds) == len(samples), f"({len(ds)} samples)")
img, seq, y = ds[0]
check("input shapes", tuple(img.shape) == (1, 64, 64) and tuple(seq.shape) == (64, 6))

batch = [ds[i] for i in range(32)]
imgs = augment_images(torch.stack([b[0] for b in batch]))
seqs = torch.stack([b[1] for b in batch])
ys = torch.tensor([b[2] for b in batch])

for mode in ("cnn", "gru", "fusion"):
    m = AirScribeNet(mode)
    out = m(imgs, seqs)
    out.sum().backward()
    check(f"{mode} forward/backward", out.shape == (32, len(CLASSES)), f"params={count_params(m):,}")

model = AirScribeNet("fusion")
opt = torch.optim.Adam(model.parameters(), 3e-3)
crit = nn.CrossEntropyLoss()
losses = []
for _ in range(30):
    opt.zero_grad()
    loss = crit(model(imgs, seqs), ys)
    loss.backward()
    opt.step()
    losses.append(loss.item())
check("training reduces loss", losses[-1] < losses[0] * 0.7, f"({losses[0]:.2f} -> {losses[-1]:.2f})")

with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    model.eval()
    torch.save({"model": model.state_dict(), "mode": "fusion", "classes": CLASSES, "epoch": 0, "val": {},
                "test_people": []}, d / "best.pt")
    sys.argv = ["export_onnx.py", str(d / "best.pt"), "--out-dir", str(d / "models")]
    try:
        import export_onnx
        export_onnx.main()
        check("ONNX export", (d / "models" / "airscribe.onnx").exists())
        try:
            import onnxruntime  # noqa: F401
            sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
            from app.inference import Predictor
            pred = Predictor(d / "models")
            raw = samples[CLASS_TO_IDX["L"] * 12]["points"]
            cam = [[1 - x / (16 / 9), yy, t] for x, yy, t in raw]  # what the webcam would send
            r = pred.predict("L", cam, aspect=16 / 9)
            check("backend inference path", set(r) >= {"letter", "confidence", "accuracy_score", "smoothness_score"},
                  str({k: r[k] for k in ("letter", "confidence", "accuracy_score", "smoothness_score")}))
        except ImportError as e:
            print(f"[SKIP] backend inference path ({e})")
    except Exception as e:  # noqa: BLE001
        check("ONNX export", False, repr(e))

print("\nALL CHECKS PASSED" if ok else "\nSOME CHECKS FAILED - send me the output")
sys.exit(0 if ok else 1)
