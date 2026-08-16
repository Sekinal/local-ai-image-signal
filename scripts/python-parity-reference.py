"""Generate reference logits with the published Pillow/ONNX preprocessing path.

Requires Python 3, numpy, Pillow, and onnxruntime. It writes no files or user data.
"""

import json
import base64
import io
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


MODEL = Path(__file__).parents[1] / "public/models/community_forensics_frontier_fp16.onnx"
MEAN = np.asarray([0.485, 0.456, 0.406], dtype=np.float32)[:, None, None]
STD = np.asarray([0.229, 0.224, 0.225], dtype=np.float32)[:, None, None]


def tensor(encoded: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(encoded)).convert("RGB")
    width, height = image.size
    scale = 440 / min(width, height)
    resized = (round(width * scale), round(height * scale))
    image = image.resize(resized, Image.Resampling.BICUBIC)
    left = round((resized[0] - 384) / 2)
    top = round((resized[1] - 384) / 2)
    image = image.crop((left, top, left + 384, top + 384))
    chw = np.asarray(image, dtype=np.float32).transpose(2, 0, 1) / 255.0
    return ((chw - MEAN) / STD)[None]


session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name
output_name = session.get_outputs()[0].name
fixture_json = subprocess.check_output(
    ["node", str(Path(__file__).with_name("parity-fixtures.mjs"))], text=True
)
specs = json.loads(fixture_json)
results = []
for spec in specs:
    encoded = base64.b64decode(spec["base64"])
    raw = float(session.run([output_name], {input_name: tensor(encoded)})[0].flat[0])
    results.append(
        {
            "id": spec["id"],
            "width": spec["width"],
            "height": spec["height"],
            "codec": spec["codec"],
            "sha256": spec["sha256"],
            "pythonRawLogit": raw,
        }
    )
json.dump(results, sys.stdout, indent=2)
sys.stdout.write("\n")
