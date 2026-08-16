# Privacy policy

Last updated: August 16, 2026

Local AI Image Signal automatically screens displayed webpage images for signals associated with AI image generation. Detection runs inside Google Chrome using model and runtime files packaged with the extension.

## Data the extension accesses

While automatic labels are enabled, the extension accesses the current webpage URL, displayed image URLs, limited image metadata such as dimensions and alternative text, and the bytes of images selected for analysis. The manual popup and context-menu flows access the same categories after a user action.

## How data is used

Image pixels are decoded, transformed, and evaluated locally in the browser. The developer does not receive webpage content, image content, URLs, scores, or usage events. The extension has no developer-operated server, analytics, advertising, telemetry, account system, cloud inference, or external API.

To analyze an image, Chrome may request it from the image's original website or CDN with credentials and referrer omitted. That host can observe the network request and network address just as it can for other image requests. The extension never sends an image to Hugging Face, the developer, an analytics provider, or an inference service.

## Storage and retention

The detection threshold, automatic-label preference, and batch limit are stored in `chrome.storage.local` on the user's device. Bounded job metadata and results are stored temporarily in memory-backed `chrome.storage.session` and are scoped to the originating tab and document. Image bytes and tensors are never persisted by the extension.

## Permissions

Access to ordinary HTTP(S) pages and image hosts is required to detect displayed images automatically, including images served by cross-origin CDNs. `activeTab` and `scripting` support the additional manual popup flow; `offscreen` enables browser-local decoding and ONNX inference; `storage` holds the settings and transient job state; `contextMenus` provides the explicit right-click action.

## User controls

Automatic labels can be disabled in the extension settings. The extension can also be disabled or removed through Chrome's extension settings, which revokes its access. Existing pages may need to be reloaded after installation or extension updates.

## Sharing and sale

The developer does not collect, sell, share, or transfer user data. The extension does not use data for advertising, eligibility, credit, or unrelated purposes.

## Changes and contact

Material changes to this policy will be committed with the corresponding source changes. Questions can be filed in the public source repository's issue tracker once the repository is published.
