"""Target classes for AirScribe.

The ids below are what the API sends and stores (field `target_letter` in the
frontend contract, kept for backwards compatibility). Display names and levels
live in the frontend (`src/config/targets.js`) and must list the same ids.
"""

SHAPES = ["hline", "vline", "circle", "square", "triangle", "wave"]
LETTERS = ["L", "T", "S", "A"]
OTHER = "other"

# Order matters: index i in the model output corresponds to CLASSES[i].
CLASSES = SHAPES + LETTERS + [OTHER]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
NUM_CLASSES = len(CLASSES)

# Classes a patient can be asked to draw ("other" is only a model output).
TARGETS = SHAPES + LETTERS

DISPLAY_NAMES = {
    "hline": "Horizontal line",
    "vline": "Vertical line",
    "circle": "Circle",
    "square": "Square",
    "triangle": "Triangle",
    "wave": "Wave",
    "L": "Letter L",
    "T": "Letter T",
    "S": "Letter S",
    "A": "Letter A",
    "other": "Not recognised",
}

LEVEL = {**{c: 1 for c in SHAPES}, **{c: 2 for c in LETTERS}}


def validate_target(target: str) -> str:
    if target not in TARGETS:
        raise ValueError(f"Unknown target '{target}'. Expected one of {TARGETS}")
    return target
