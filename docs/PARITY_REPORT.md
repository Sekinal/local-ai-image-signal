# Browser/Python preprocessing parity

Executed 2026-08-16 on Chrome 151 (Apple Silicon) using the production MV3 package, FP16 ONNX artifact SHA-256 `d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d`, ONNX Runtime Web 1.27.0, and WebGPU. Python references used the identical SHA-pinned encoded fixture bytes, Pillow 12.3.0 bicubic preprocessing, and ONNX Runtime CPU 1.28.0.

The shared fixture generator produces deterministic PNG, JPEG, WebP, portrait, landscape, odd-crop, and alpha cases. Every encoded fixture SHA-256 is pinned in `tests/parity-reference.json`; Chrome refuses to run the gate if any byte changes. The production E2E gate requires every raw-boundary decision to agree and at least one Python reference within 0.05 of raw boundary 1.359375. Each opaque fixture has its own 0.03–0.075 maximum based on measured drift; only the alpha fixture has a separately documented 0.4 maximum.

| Fixture            | Python raw | Chrome raw | Absolute difference | Boundary decision |
| ------------------ | ---------: | ---------: | ------------------: | ----------------- |
| landscape PNG      |   2.277642 |   2.253906 |            0.023736 | agree             |
| near-boundary PNG  |   1.230423 |   1.217773 |            0.012650 | agree             |
| portrait PNG       |   3.008955 |   2.980469 |            0.028486 | agree             |
| odd-crop PNG       |   4.240469 |   4.226563 |            0.013907 | agree             |
| near-boundary JPEG |   1.386926 |   1.436523 |            0.049598 | agree             |
| square WebP        |   0.312946 |   0.331543 |            0.018597 | agree             |
| alpha PNG          |   3.867181 |   3.509766 |            0.357415 | agree             |

All 7/7 threshold decisions agreed on WebGPU. Maximum difference was 0.357415 on the alpha fixture; maximum across opaque fixtures was 0.049598.

The same packaged suite was forced through the WASM-only provider and completed successfully. WASM also had 7/7 decision agreement; maximum opaque difference was 0.003007 and alpha difference was 0.366496. The provider actually selected is persisted in validated job state and asserted by the test, so this does not rely on browser feature flags.

The larger alpha difference is consistent with browser decode/compositing semantics, has a separate tolerance, and triggers a visible caution when transparency is detected. These fixtures validate the packaged preprocessing/runtime path but do not replace population-level model evaluation or prove parity for every browser/codec/color-profile implementation.
