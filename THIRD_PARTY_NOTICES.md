# Third-party notices

Runtime dependencies bundled into production output:

- **Community Forensics frontier detector** — MIT; model card and provenance at [Hugging Face](https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08). Base model `OwensLab/commfor-model-384` is declared MIT by the release.
- **ONNX Runtime Web 1.27.0** — MIT, Microsoft Corporation and contributors. Its matching asyncify WASM runtime is emitted from the same pinned npm package.
- **React / React DOM 19.2.8** — MIT, Meta Platforms, Inc. and affiliates.
- **Zod 4.4.3** — MIT, Colin McDonnell and contributors.
- **WXT-generated runtime/build output** — WXT is MIT; it is primarily build tooling, with its required generated browser shim included in production output.

The packaged `SBOM.runtime.json` records these runtime components and versions. Development-only packages and transitive license texts remain available in `node_modules` and package metadata. Before external distribution, archive a full machine-generated license report from `package-lock.json` as part of the release record.
