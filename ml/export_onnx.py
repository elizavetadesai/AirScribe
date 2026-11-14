"""Export a checkpoint to ONNX for the backend (no PyTorch needed on the server).

    python export_onnx.py runs/fusion/best.pt --bounds models/score_bounds.json

Writes models/airscribe.onnx and models/airscribe_meta.json, then checks that
ONNX Runtime gives the same output as PyTorch.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

import numpy as np
import torch

from airscribe_ml.classes import CLASSES
from airscribe_ml.model import AirScribeNet, count_params
from airscribe_ml.preprocess import IMG_SIZE, N_FEATURES, N_POINTS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ckpt")
    ap.add_argument("--out-dir", type=Path, default=Path("models"))
    ap.add_argument("--bounds", type=Path, help="score_bounds.json from calibrate_scores.py")
    ap.add_argument("--metrics", type=Path, help="eval metrics.json to embed in the metadata")
    args = ap.parse_args()

    ck = torch.load(args.ckpt, map_location="cpu", weights_only=False)
    model = AirScribeNet(ck["mode"])
    model.load_state_dict(ck["model"])
    model.eval()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out_dir / "airscribe.onnx"
    img = torch.rand(2, 1, IMG_SIZE, IMG_SIZE)
    seq = torch.rand(2, N_POINTS, N_FEATURES)
    kwargs = dict(input_names=["image", "sequence"], output_names=["logits"],
                  dynamic_axes={"image": {0: "batch"}, "sequence": {0: "batch"}, "logits": {0: "batch"}},
                  opset_version=17)
    try:  # newer PyTorch: force the classic exporter (stable for GRUs)
        torch.onnx.export(model, (img, seq), str(onnx_path), dynamo=False, **kwargs)
    except TypeError:  # older PyTorch has no `dynamo` argument
        torch.onnx.export(model, (img, seq), str(onnx_path), **kwargs)

    meta = {
        "classes": ck.get("classes", CLASSES), "mode": ck["mode"], "img_size": IMG_SIZE,
        "n_points": N_POINTS, "n_features": N_FEATURES, "params": count_params(model),
        "trained_epoch": ck.get("epoch"), "val": ck.get("val"), "test_people": ck.get("test_people"),
        "exported": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source_checkpoint": str(args.ckpt),
    }
    if args.bounds and args.bounds.exists():
        meta["score_bounds"] = json.loads(args.bounds.read_text())
    if args.metrics and args.metrics.exists():
        m = json.loads(args.metrics.read_text())
        meta["test_metrics"] = {k: m[k] for k in ("accuracy", "macro_f1", "n", "evaluated_on") if k in m}
    (args.out_dir / "airscribe_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"wrote {onnx_path} ({onnx_path.stat().st_size / 1e6:.1f} MB) and airscribe_meta.json")

    try:
        import onnxruntime as ort
    except ImportError:
        print("onnxruntime not installed; skipped the parity check (pip install onnxruntime)")
        return
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feeds = {"image": img.numpy(), "sequence": seq.numpy()}
    feeds = {i.name: feeds[i.name] for i in sess.get_inputs()}  # single-branch models drop one input
    onnx_out = sess.run(None, feeds)[0]
    with torch.no_grad():
        torch_out = model(img, seq).numpy()
    diff = float(np.abs(onnx_out - torch_out).max())
    print(f"ONNX vs PyTorch max abs difference: {diff:.2e}  ({'OK' if diff < 1e-3 else 'CHECK THIS'})")


if __name__ == "__main__":
    main()
