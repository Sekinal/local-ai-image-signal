# Threat and privacy model

## Data handled

Displayed image URLs, page URL, basic dimensions/alt text, decoded pixels, input tensors, raw logits, and derived scores are handled solely to provide automatic or manually requested local screening results. Pixels/tensors stay in the offscreen document and are not persisted. Embedded/blob URLs are redacted from results. Bounded job metadata/results use memory-backed, tab-keyed `chrome.storage.session`; preferences use `chrome.storage.local`.

The extension has no developer server, analytics, ads, account, telemetry, crash reporting, or third-party data transfer. Fetching an image necessarily contacts its original host; requests omit credentials and referrer, though the host still sees the network address and request.

## Adversaries and mitigations

| Threat                                   | Mitigation                                                                                                                                                                                         | Residual risk                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Hostile page sends crafted values        | The automatic content script executes in an isolated extension world; the background derives tab/document identity from Chrome; every runtime message is Zod-validated and size/range-capped.      | Page-controlled URLs and metadata are still untrusted inputs to browser decoders.                                                  |
| Cross-origin privilege abuse             | Broad HTTP(S) access is used only for automatic inventory and credential-free image fetches; there is no page-facing message bridge, externally-connectable API, or arbitrary fetch command.       | The extension can technically read HTTP(S) page/image resources, so source review and accurate disclosure remain essential.        |
| Remote code or supply-chain substitution | All JS/WASM/model assets are bundled; dependency/model versions are pinned; model download has SHA-256 verification; lockfile is committed.                                                        | npm/build system compromise remains possible; release builders should use `npm ci` and inspect audit/SBOM output.                  |
| XSS in popup/options                     | React escapes text; no `innerHTML`, eval, remote scripts, or externally connectable endpoint; strict extension CSP.                                                                                | A vulnerability in a packaged dependency could still matter.                                                                       |
| Browser history/image retention          | Automatic inventory is limited to the current document's displayed images; image bytes are never saved; metadata is session-only and document-scoped.                                              | Chrome/network caches may retain original resources independently of this extension.                                               |
| Model extraction/tampering               | Model is an extension resource and hash-pinned. It is intentionally public and can be copied.                                                                                                      | This is integrity, not secrecy; unpacked-extension users can replace files.                                                        |
| Misuse of a fallible score               | On-page labels say “AI score,” avoid authorship accusations, and expose a tooltip saying the score is a fallible screening signal rather than proof.                                               | Compact automatic badges provide less context than the popup/model documentation, and users can still overinterpret them.          |
| Resource exhaustion                      | One global job; 100-image cap; 5 MB aggregate URL cap; 50 MB response cap; 20 MP decode, 8192 px/dimension, 24:1 aspect, and 12 MP resize-work limits; sequential inference; bitmap/session close. | A compressed image can consume decoder work before decoded dimensions can be checked; Chrome's own decoder limits remain relevant. |

## Store-readiness boundary

This repository contains the disclosure text, but no public website is deployed by this task. Chrome Web Store submission must not proceed until an accurate privacy policy is hosted at a stable public URL and that URL is entered in the listing.

## Chrome Web Store disclosure draft

Single purpose: “Automatically screen displayed web images locally for signals associated with AI image generation.”

Data use: Page and image content is accessed while automatic labels are enabled or after a manual user action. It is processed locally to return on-page results, is not transmitted to the developer or third parties, is not sold, and is not used for advertising, credit, or unrelated purposes. Fetching an image may contact its original website/CDN without credentials. Settings remain on the device. The extension uses no Google APIs.
