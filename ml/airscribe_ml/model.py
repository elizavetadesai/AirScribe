"""AirScribeNet: two-branch CNN + BiGRU classifier.

    image (1x64x64) --CNN--> 128-d  \
                                      concat -> MLP -> 11 class logits
    sequence (64x6) --BiGRU--> 128-d /

mode="cnn" or "gru" uses one branch with its own linear head (for the
ablation), mode="fusion" uses both. The CNN is the computer-vision part: it
reads the drawing as a picture. The GRU reads how the fingertip moved over time.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from .classes import NUM_CLASSES
from .preprocess import IMG_SIZE, N_FEATURES, N_POINTS

EMB = 128


def _block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
    )


class CNNBranch(nn.Module):
    def __init__(self, emb: int = EMB, dropout: float = 0.2):
        super().__init__()
        self.features = nn.Sequential(_block(1, 32), _block(32, 64), _block(64, 128))  # 64->8 px
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.proj = nn.Sequential(nn.Flatten(), nn.Dropout(dropout), nn.Linear(128, emb), nn.ReLU(inplace=True))

    def forward(self, img: torch.Tensor) -> torch.Tensor:  # (B,1,64,64)
        return self.proj(self.pool(self.features(img)))


class GRUBranch(nn.Module):
    def __init__(self, n_features: int = N_FEATURES, hidden: int = 96, emb: int = EMB, dropout: float = 0.2):
        super().__init__()
        self.inp = nn.Sequential(nn.Linear(n_features, 64), nn.ReLU(inplace=True))
        self.gru = nn.GRU(64, hidden, num_layers=2, batch_first=True, bidirectional=True, dropout=dropout)
        self.proj = nn.Sequential(nn.Dropout(dropout), nn.Linear(4 * hidden, emb), nn.ReLU(inplace=True))

    def forward(self, seq: torch.Tensor) -> torch.Tensor:  # (B,64,6)
        out, h = self.gru(self.inp(seq))           # out (B,T,2H), h (layers*2,B,H)
        last = torch.cat([h[-2], h[-1]], dim=1)    # final forward + backward states
        return self.proj(torch.cat([last, out.mean(1)], dim=1))


class AirScribeNet(nn.Module):
    def __init__(self, mode: str = "fusion", num_classes: int = NUM_CLASSES,
                 modality_dropout: float = 0.15):
        super().__init__()
        assert mode in ("cnn", "gru", "fusion")
        self.mode = mode
        self.modality_dropout = modality_dropout
        self.cnn = CNNBranch() if mode in ("cnn", "fusion") else None
        self.gru = GRUBranch() if mode in ("gru", "fusion") else None
        if mode == "fusion":
            self.head = nn.Sequential(nn.Linear(2 * EMB, 128), nn.ReLU(inplace=True), nn.Dropout(0.3),
                                      nn.Linear(128, num_classes))
        else:
            self.head = nn.Linear(EMB, num_classes)

    def forward(self, img: torch.Tensor, seq: torch.Tensor) -> torch.Tensor:
        if self.mode == "cnn":
            return self.head(self.cnn(img))
        if self.mode == "gru":
            return self.head(self.gru(seq))
        a, b = self.cnn(img), self.gru(seq)
        if self.training and self.modality_dropout > 0:
            # randomly hide one branch so the model cannot rely on only one of them
            r = torch.rand(a.shape[0], 1, device=a.device)
            a = a * (r >= self.modality_dropout / 2).float()
            b = b * ((r < self.modality_dropout / 2) | (r >= self.modality_dropout)).float()
        return self.head(torch.cat([a, b], dim=1))

    def load_branches(self, ckpt_paths: list[str]) -> list[str]:
        """Copy pretrained branch weights (cnn.* / gru.*) from checkpoints."""
        loaded = []
        own = self.state_dict()
        for path in ckpt_paths:
            sd = torch.load(path, map_location="cpu", weights_only=False)["model"]
            take = {k: v for k, v in sd.items()
                    if k.split(".")[0] in ("cnn", "gru") and k in own and own[k].shape == v.shape}
            own.update(take)
            loaded += sorted({k.split(".")[0] for k in take})
        self.load_state_dict(own)
        return loaded


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def augment_images(img: torch.Tensor, max_rot_deg: float = 8, scale=(0.9, 1.1), shift: float = 0.06):
    """Small random affine warp on a batch of images (on GPU if available)."""
    b = img.shape[0]
    ang = (torch.rand(b, device=img.device) * 2 - 1) * max_rot_deg * 3.14159 / 180
    sc = torch.empty(b, device=img.device).uniform_(*scale)
    tx, ty = [(torch.rand(b, device=img.device) * 2 - 1) * shift for _ in range(2)]
    cos, sin = torch.cos(ang) / sc, torch.sin(ang) / sc
    theta = torch.stack([torch.stack([cos, -sin, tx], 1), torch.stack([sin, cos, ty], 1)], 1)
    grid = F.affine_grid(theta, img.shape, align_corners=False)
    return F.grid_sample(img, grid, align_corners=False, padding_mode="zeros")


INPUT_SHAPES = {"image": (1, 1, IMG_SIZE, IMG_SIZE), "sequence": (1, N_POINTS, N_FEATURES)}
