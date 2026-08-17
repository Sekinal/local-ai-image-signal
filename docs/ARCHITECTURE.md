# Architecture

## Runtime flow

1. A packaged isolated-world content script runs on ordinary HTTP(S) pages. When automatic labels are enabled, it observes visible `<img>` and CSS-background images (including dynamically inserted images), deduplicates identical URLs, batches them, and displays progress/results in an accessibility-labelled Shadow DOM overlay. The manual popup provides an additional explicit inventory flow.
2. Automatic operation requires declared HTTP(S) host access so the extension can read cross-origin/CDN image bytes without a permission prompt for every image. The service worker derives tab and Chrome document identity from the content-script sender rather than trusting page-supplied identity.
3. The service worker validates document identity and aggregate URL size; acquires the single-job lock; writes transient tab-keyed state to `chrome.storage.session`; ensures one offscreen document exists; and forwards a bounded job (maximum 100 images).
4. The offscreen document fetches each original image with credentials omitted, enforces response, 20 MP/8192 px decoded-canvas, aspect-ratio, and resize-work limits, and applies EXIF-aware browser decoding. A deterministic two-pass Pillow-style bicubic implementation resizes the short edge to 440, then center-crops 384×384, normalizes RGB with ImageNet mean/std, and creates one `[1,3,384,384]` float32 tensor. Geometry uses Python-compatible ties-to-even rounding; the release gate checks seven hashed Python/Chrome parity fixtures and warns when transparency is detected.
5. ONNX Runtime Web runs the bundled FP16 model with WebGPU preferred and WASM fallback. The raw output is Platt-calibrated with `sigmoid(0.6352260751077209 * logit - 0.2643220522904507)` and compared with the user threshold (published default 0.65; raw boundary 1.390625).
6. Progress/results return through validated extension messages targeted to the originating Chrome `documentId`; the content script renders `AI score N%` beside matching images. Image bytes and tensors are discarded, embedded/blob URLs are redacted before state storage, and the model session/offscreen document close after the job.

## Components

- `entrypoints/auto-label.content.ts`: automatic image observation, bounded batching, dynamic-page handling, and on-image score overlays.
- `entrypoints/background.ts`: sender-identity validation, manual page inventory, navigation-bound context menu, offscreen lifecycle, tab-keyed job coordinator.
- `entrypoints/offscreen/`: DOM image decoding, preprocessing, ONNX session reuse, sequential inference, cancellation between images.
- `entrypoints/popup/`: user-driven discovery, selection, permission request, progress, cancellation, cautious results.
- `entrypoints/options/`: local threshold, automatic-label toggle, batch limit, privacy/limitations.
- `lib/schema.ts`: Zod message and state boundary (length/range caps included).
- `lib/preprocess.ts` and `lib/model.ts`: isolated, testable ML contract.
- `public/models/`: pinned model packaged inside the extension. Vite emits the exact matching WASM artifact imported by the pinned ONNX Runtime module.

## Failure containment

- A global storage-backed lock permits only one job across all tabs; images within it are sequential to bound GPU/CPU memory.
- Cancellation is cooperative between inference calls; an active `session.run` cannot be interrupted safely.
- Unsupported blob URLs, huge responses, non-image MIME types, tiny images, decode failures, host denials, and inference failures become per-image errors.
- A model initialization error resets the cached promise so a later run can retry.
- Service-worker restart does not lose visible job status or the cross-tab job lock because both are in `storage.session`.

## Permission rationale

- HTTP(S) host access: automatically discover displayed images and fetch same-origin or CDN image bytes for local inference. This broad access is necessary for unattended operation and is never used for telemetry or remote transmission.
- `activeTab` + `scripting`: support the additional manual popup inventory flow.
- `contextMenus`: explicit “screen this image” flow.
- `offscreen`: run DOM/canvas/worker-dependent inference outside the ephemeral service worker.
- `storage`: small local preferences and session-only job state.
