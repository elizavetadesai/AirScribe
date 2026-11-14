"""Model loading and the full prediction pipeline for one attempt.

raw webcam points -> preprocess (shared with training) -> ONNX model ->
recognised class + confidence -> accuracy and smoothness scores.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

try:
    import airscribe_ml  # noqa: F401
except ImportError:  # running from the repo: make ../ml importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml"))

from airscribe_ml.classes import CLASSES, DISPLAY_NAMES  # noqa: E402
from airscribe_ml.preprocess import prepare, rasterize, sequence_features  # noqa: E402
from airscribe_ml.scoring import accuracy_score, shape_similarity, smoothness  # noqa: E402

ONNX_NAME = "airscribe.onnx"
META_NAME = "airscribe_meta.json"


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


class Predictor:
    def __init__(self, model_dir: Path, session=None, meta: dict | None = None):
        model_dir = Path(model_dir)
        if session is None:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1  # small model; avoids thread overhead on tiny CPUs
            session = ort.InferenceSession(str(model_dir / ONNX_NAME), sess_options=opts,
                                           providers=["CPUExecutionProvider"])
        if meta is None:
            meta_path = model_dir / META_NAME
            meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        self.session = session
        self.meta = meta
        self.classes: list[str] = meta.get("classes", CLASSES)
        self.bounds = meta.get("score_bounds")  # None -> built-in defaults
        self.input_names = {i.name for i in session.get_inputs()}
        self._warmup()

    def _warmup(self):
        feeds = {"image": np.zeros((1, 1, 64, 64), np.float32), "sequence": np.zeros((1, 64, 6), np.float32)}
        self.session.run(None, {k: v for k, v in feeds.items() if k in self.input_names})

    @property
    def info(self) -> dict:
        return {"mode": self.meta.get("mode"), "exported": self.meta.get("exported"),
                "test_metrics": self.meta.get("test_metrics"), "classes": self.classes,
                "calibrated_scores": self.bounds is not None}

    def predict(self, target: str, points, aspect: float | None = None) -> dict:
        t0 = time.perf_counter()
        arr = prepare(points, aspect=aspect, from_webcam=True)
        feeds = {"image": rasterize(arr)[None, None].astype(np.float32),
                 "sequence": sequence_features(arr)[None].astype(np.float32)}
        t1 = time.perf_counter()
        logits = self.session.run(None, {k: v for k, v in feeds.items() if k in self.input_names})[0][0]
        t2 = time.perf_counter()
        probs = _softmax(np.asarray(logits, np.float64))
        best = int(probs.argmax())
        p_target = float(probs[self.classes.index(target)]) if target in self.classes else 0.0
        similarity = shape_similarity(arr, target)
        smooth = smoothness(arr, target, self.bounds)
        t3 = time.perf_counter()
        return {
            "letter": self.classes[best],
            "confidence": round(float(probs[best]), 4),
            "accuracy_score": accuracy_score(p_target, similarity),
            "smoothness_score": smooth["score"],
            "predicted_name": DISPLAY_NAMES.get(self.classes[best], self.classes[best]),
            "target_probability": round(p_target, 4),
            "shape_similarity": round(similarity, 3),
            "probabilities": {c: round(float(p), 4) for c, p in zip(self.classes, probs)},
            "sparc": round(smooth["sparc"], 3),
            "ldlj": round(smooth["ldlj"], 3),
            "speed_peaks": smooth["speed_peaks"],
            "duration_s": round(smooth["duration_s"], 2),
            "timing_ms": {"preprocess": round((t1 - t0) * 1000, 2), "model": round((t2 - t1) * 1000, 2),
                          "scoring": round((t3 - t2) * 1000, 2), "total": round((t3 - t0) * 1000, 2)},
        }


def load_predictor(model_dir: Path) -> tuple[Predictor | None, str | None]:
    if not (Path(model_dir) / ONNX_NAME).exists():
        return None, f"No model at {Path(model_dir) / ONNX_NAME}. Train and run ml/export_onnx.py."
    try:
        return Predictor(model_dir), None
    except Exception as e:  # noqa: BLE001
        return None, f"Model failed to load: {e!r}"
