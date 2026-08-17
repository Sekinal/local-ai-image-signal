# Packaged model summary

Source: [Thermostatic/community-forensics-low-quality-detector-2026-08](https://huggingface.co/Thermostatic/community-forensics-low-quality-detector-2026-08), immutable revision `17a23afcd6ee55a41809bb06ff4fd43faea6b639`.

## Contract

- Architecture: Community Forensics `vit_small_patch16_384`, continued from the prior frontier detector and ultimately fine-tuned from `OwensLab/commfor-model-384`.
- Artifact: FP16 ONNX, opset 17, 43,778,110 bytes, SHA-256 `88ca8e90…9ff17`.
- Input: decoded RGB; short edge resized to 440 with a deterministic two-pass Pillow-style bicubic filter, center crop 384, ImageNet normalization, NCHW float32. Geometry uses Python ties-to-even rounding. Codec, color, and alpha behavior can still differ beyond the tested fixtures.
- Output: one raw logit. Calibrated score is `sigmoid(0.6352260751077209 * raw_logit - 0.2643220522904507)`. Threshold 0.65 corresponds to raw boundary 1.390625.
- License: MIT; the base releases are also declared MIT.

## Training and data

The unchanged combined manifest contains 113,472 images: 109,560 training (41,313 real; 68,247 generated) and 3,912 calibration (1,983 real; 1,929 generated), spanning 136 training sources. It combines older forensic corpora with 40,101 deduplicated frontier images. The public frontier component is [Thermostatic/frontier-synthetic-images-2026](https://huggingface.co/datasets/Thermostatic/frontier-synthetic-images-2026); it is not the full mixed corpus, and source-specific terms remain applicable.

The continuation ran 2,400 steps with batch 96 (230,400 samples), fused AdamW at `3e-6`, 120-step warmup then cosine decay, EMA 0.999, exact class-balanced/source-temperature sampling, and zero decode failures. Class-symmetric augmentation used a 30% web mixture plus a 70% tiny-source mixture spanning 32–256 pixels with randomized resizing, JPEG/WebP recompression, blur, noise, and unsharp filtering. The locked competition test was never opened.

## Honest evaluation

- Clean/web/hard balanced accuracy: **0.9530 / 0.9359 / 0.8982**, regressions of **0.0038 / 0.0026 / 0.0065** from v1.0.
- Low-quality macro balanced accuracy: **0.5992 → 0.7584** (**+0.1592**).
- Low-quality macro fake recall: **0.2013 → 0.5612** (**+0.3599**).
- Worst-resolution balanced accuracy: **+0.2518**.
- Recent-HF low-quality macro recall: **0.2518 → 0.5833** (189 positive-only images).
- OpenRouter low-quality macro recall: **0.1796 → 0.4537** (90 positive-only images).
- Fake recall after resizing to 128/96/64/48/32 pixels: **0.8139 / 0.7942 / 0.6884 / 0.6262 / 0.5687**.
- Fake recall after 128px JPEG30 / 96px JPEG20 / 64px multihop / 48px multihop: **0.5837 / 0.3914 / 0.2374 / 0.1078**.
- ONNX/PyTorch threshold-decision agreement across 11,736 clean/web/hard predictions: **99.7699%**.

All figures are development/calibration evidence. The calibration set participated in model development; recent cohorts are small and positive-only. None establishes performance on arbitrary future internet images or the private bounty benchmark.

## Failed robustness gates

The 33-condition development red-team report remains `valid: false`. The 5%-foreground composite attack produced balanced accuracy 0.5080 and fake recall 0.0492; per-image worst-of-all-attacks fake recall was 0.0026. External generative-laundering, physical-recapture, and platform-laundering cohorts were absent.

This is a whole-image screening classifier, not a localization detector or proof of provenance. Deliberate composite evasion, extreme multi-hop degradation, screenshots/recaptures, unseen generators, and images below 48 pixels remain important weak cases. Full machine-readable positive and negative results are published with the Hugging Face release.
