# Browser/Python preprocessing parity

Executed 2026-08-16 on Chrome 151 (Apple Silicon) using the production MV3 package, FP16 ONNX artifact SHA-256 `88ca8e90e5ab33e6e13887124614e14ba96d7c8cc9ecb21505b63cdc6549ff17`, ONNX Runtime Web 1.27.0, and WebGPU. Python references used the identical SHA-pinned encoded fixture bytes, Pillow 12.3.0 bicubic preprocessing, and ONNX Runtime CPU 1.24.3.

The shared fixture generator produces deterministic PNG, JPEG, WebP, portrait, landscape, odd-crop, and alpha cases. Every encoded fixture SHA-256 is pinned in `tests/parity-reference.json`; Chrome refuses to run the gate if any byte changes. The production E2E gate requires every raw-boundary decision to agree and at least one Python reference within 0.05 of raw boundary 1.390625. Per-fixture bounds are retained in the reference file and are tighter than the initially measured provisional limits.

| Fixture           | Python raw | WebGPU raw | Absolute difference | Boundary decision |
| ----------------- | ---------: | ---------: | ------------------: | ----------------- |
| Landscape PNG     |   2.862717 |   2.849609 |            0.013108 | agree             |
| Near-boundary PNG |   1.435818 |   1.414063 |            0.021755 | agree             |
| Portrait PNG      |   3.151981 |   3.117188 |            0.034793 | agree             |
| Odd-crop PNG      |   3.945158 |   3.949219 |            0.004061 | agree             |
| Wide JPEG         |   1.523373 |   1.623047 |            0.099673 | agree             |
| Square WebP       |   1.189327 |   1.207031 |            0.017704 | agree             |
| Alpha PNG         |   3.683626 |   3.375000 |            0.308626 | agree             |

All 7/7 threshold decisions agreed on WebGPU. Maximum difference was 0.308626 on the alpha fixture; maximum across opaque fixtures was 0.099673 on the JPEG fixture.

The same packaged suite was forced through the WASM provider and completed successfully. WASM also had 7/7 decision agreement; maximum opaque difference was 0.003504 and alpha difference was 0.331804. The provider actually selected is persisted in validated job state and asserted by the test, so this does not rely on browser feature flags.

The larger alpha difference is consistent with browser decode/compositing semantics and has a separate 0.4 tolerance. The wide JPEG has a 0.12 tolerance for the observed browser/Pillow codec and preprocessing difference. Transparency triggers a visible caution. These fixtures validate the packaged preprocessing/runtime path but do not replace population-level evaluation or prove parity for every browser, codec, color-profile, GPU, or operating-system implementation.
