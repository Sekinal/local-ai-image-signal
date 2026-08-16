# Packaged model summary

Source: [Thermostatic/community-forensics-frontier-detector-2026-08](https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08), immutable revision `16db135220b318d811b207db576d90368980b595`.

## Contract

- Architecture: Community Forensics `vit_small_patch16_384`, fine-tuned from `OwensLab/commfor-model-384`.
- Artifact: FP16 ONNX, opset 17, 43,778,110 bytes, SHA-256 `d75791ba…9375d`.
- Input: decoded RGB; short edge resized to 440 with a deterministic two-pass Pillow-style bicubic filter, center crop 384, ImageNet mean `[0.485,0.456,0.406]`, std `[0.229,0.224,0.225]`, NCHW float32. Geometry uses Python ties-to-even rounding. See the executed browser/Python parity report; codec/color/alpha behavior can still vary beyond its fixtures.
- Output: one raw logit. Calibrated score is `sigmoid(raw_logit - 0.7403357915937764)`. Published threshold is 0.65, corresponding to raw boundary 1.359375.
- License: MIT. Base model is also declared MIT.

## Training and data

The final combined manifest contained 113,472 images: 109,560 training (41,313 real; 68,247 generated) and 3,912 calibration (1,983 real; 1,929 generated), spanning 136 training sources. It combined a 73,371-row legacy corpus with 40,101 newly deduplicated frontier training images. The public frontier component is [Thermostatic/frontier-synthetic-images-2026](https://huggingface.co/datasets/Thermostatic/frontier-synthetic-images-2026); it is not the complete combined corpus and source-specific terms remain applicable.

Training used 6,000 steps, batch 96, AdamW at `1e-5`, 300-step warmup then cosine decay, EMA 0.999, source-temperature/class-balanced sampling, and symmetric resize/codec/crop/blur augmentation. The selected checkpoint was step 4,500.

## Honest evaluation

- Calibration macro balanced accuracy across clean/web/hard: **0.9328**.
- Clean/web/hard balanced accuracy: **0.9568 / 0.9385 / 0.9047**.
- Per-image worst across those three views: **0.8829**.
- Protected recent-HF recall clean/web/hard: **0.9788 / 0.9312 / 0.7407** (189 positive-only images).
- Protected OpenRouter recall clean/web/hard: **0.8778 / 0.6556 / 0.4778** (90 positive-only images).
- ONNX/PyTorch threshold-decision agreement on the 11,736-row clean/web/hard ledger: **99.71%**.
- Locked competition test: **never opened**.

The full robustness suite did **not** pass. At only 5% synthetic area, composite balanced accuracy was 0.5100 with 0.0492 fake recall; per-image worst-case BA across all attacks was 0.2766. External physical/platform/generative-laundering cohorts were incomplete. The extension therefore treats output as a screening signal and specifically warns about partial composites, low resolution, heavy laundering, and recent generators.

The reported calibration set participated in checkpoint/model development. The recent cohorts are protected from training but small and positive-only. None of these metrics establishes performance on arbitrary future internet images.
