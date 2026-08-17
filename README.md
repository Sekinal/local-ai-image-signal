# Local AI Image Signal — Chrome extension

[![verify](https://github.com/Sekinal/local-ai-image-signal/actions/workflows/verify.yml/badge.svg)](https://github.com/Sekinal/local-ai-image-signal/actions/workflows/verify.yml)

A reproducible Manifest V3 extension that automatically labels displayed webpage images with the published Community Forensics low-quality detector. Inference happens in Chrome with packaged ONNX Runtime Web assets. There is no image upload, telemetry, account, token, local server, external API, or cloud fallback.

This is a screening tool, not an authorship oracle. Do not use a result alone to accuse a person or make a high-impact decision.

## Use

1. Install Node.js 22.12 or newer.
2. Run `npm ci` (or `npm install` on the first lockfile generation).
3. Run `npm run model:fetch`. The script downloads the immutable public FP16 ONNX release and verifies SHA-256. If this repository checkout already contains the verified artifact, it exits without downloading.
4. Run `npm run verify:release` with Chrome installed. This performs the complete static, package, WebGPU, WASM, parity, and automatic-page gates.
5. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3`.
6. Open or reload a normal HTTP(S) page. Displayed `<img>` and CSS-background images at least 48×48 CSS pixels are queued automatically and receive an **AI score** badge after local inference. The popup and **Screen this image for AI signals** context menu provide manual checks.

The production ZIP is created under `.output/`. Model and runtime assets are bundled in that ZIP, so the installed extension works with internet access disabled except for the ordinary image hosts a webpage itself uses. The source is licensed under [MIT](LICENSE).

Public repository: [Sekinal/local-ai-image-signal](https://github.com/Sekinal/local-ai-image-signal).

The exact training/evaluation source, pinned Python and GPU environment, SHA-verified
checkpoint fetcher, manifest-recovery tools, and rerun commands are published in
[Sekinal/local-ai-image-signal-training](https://github.com/Sekinal/local-ai-image-signal-training).
The large recovery artifacts are pinned to immutable Hugging Face revision
[`6fca3e7f4365363ee5c0fdb1a17d73917d54413d`](https://huggingface.co/Thermostatic/community-forensics-low-quality-detector-2026-08/tree/6fca3e7f4365363ee5c0fdb1a17d73917d54413d).

## Scripts

- `npm run dev` — WXT development build/runner.
- `npm run format` / `format:check` — pinned Prettier.
- `npm run lint` — strict type-aware ESLint.
- `npm run typecheck` — strict TypeScript.
- `npm test` / `test:coverage` — deterministic contract, schema, and UI tests.
- `npm run test:e2e` — load the production build in local Chrome and compare seven hashed PNG/JPEG/WebP/alpha fixtures against Python reference logits.
- `npm run test:e2e:wasm` — repeat the packaged parity smoke with Chrome WebGPU disabled, proving the bundled WASM-only path.
- `npm run test:e2e:auto` — load an ordinary HTTP page in clean Chrome and require an automatic on-image score badge.
- `npm run parity:python` — regenerate reference logits (requires Python, Pillow, NumPy, and ONNX Runtime) for the hashed parity fixtures.
- `npm run build` — production MV3 build with matching local ORT WASM assets.
- `npm run package` — deterministic store-ready ZIP via WXT.
- `npm run verify` — format, lint, typecheck, test, build, package.
- `npm run verify:release` — complete release gate plus real-Chrome packaged inference.

## Manual Chrome smoke test

Automated jsdom tests cannot validate a browser GPU driver or Chrome permission UI. Before release, test the unpacked production build in current Chrome on at least macOS and Windows:

1. Inspect `manifest.json`: MV3, minimum Chrome 127, required HTTP(S) host access for automatic page/CDN analysis, no `web_accessible_resources`, and self-only CSP plus `wasm-unsafe-eval`.
2. On a page with same-origin, CDN, data-URL, SVG, tiny, WebP, and AVIF `<img>` examples, verify automatic score badges and explicit unsupported/warning states. CSS backgrounds, canvas, and blob URLs remain available only where the manual flow can read them.
3. Disable and re-enable automatic labels in settings; verify no new automatic jobs start while disabled.
4. Analyze multiple images, close/reopen the popup during inference, cancel midway, and verify progress/state recovery.
5. Run `npm run verify:release` and inspect `docs/PARITY_REPORT.md`. Repeat the hashed parity suite on each supported Chrome/OS target; investigate any threshold flip or tolerance failure.
6. Test WebGPU enabled and disabled. Confirm WASM fallback or a clear local error—never a network/cloud fallback.
7. Test keyboard-only at 100%/200% zoom, dark mode, forced-colors/high-contrast mode, reduced motion, and a screen reader.
8. Inspect DevTools Network: requests may go only to the displayed image’s original host; no request goes to Hugging Face, the developer, analytics, or an ad endpoint.

## Bounty compliance boundary

- Automatic detection is enabled by default on ordinary HTTP(S) pages and places the calibrated score beside analyzed `<img>` and CSS-background images.
- The required decision threshold defaults to exactly `0.65`.
- The model, JavaScript, and WASM runtime are packaged; inference remains offline and browser-local.
- Builds are reproducible from the lockfile and immutable model revision/hash. `npm run model:fetch` is the only model acquisition step.
- No benchmark hashes, private evaluation data, lookup table, backend process, cloud inference, or external API is used.

The private bounty benchmark cannot be reproduced locally, so qualification at 75% balanced accuracy can only be established by the maintainers. The public robustness metrics and known recent-generator weaknesses are reported in [the model summary](docs/MODEL_CARD.md), not extrapolated into a claim about the private benchmark.

Compared with v1.0.0, this release raises development low-quality macro balanced accuracy by 15.9 points and fake recall by 36.0 points while keeping clean/web/hard balanced-accuracy regressions below 0.7 points. It does not solve deliberate composite evasion or extreme multi-hop laundering.

## Documentation

- [Research and decisions](docs/RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Threat/privacy model](docs/THREAT_MODEL.md)
- [Packaged model summary](docs/MODEL_CARD.md)
- [Training and evaluation source](https://github.com/Sekinal/local-ai-image-signal-training)
- [Browser/Python parity report](docs/PARITY_REPORT.md)
- [Bounty compliance matrix](docs/BOUNTY_COMPLIANCE.md)
- [Privacy policy](PRIVACY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
