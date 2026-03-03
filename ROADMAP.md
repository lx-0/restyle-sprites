# Roadmap

> Direction and priorities for `restyle-sprites`.
> This document is designed to be consumed by both human contributors and AI agents working on the codebase.

## How to Use This Document

- **Humans**: Pick something that interests you, open an issue to discuss, or submit a PR.
- **AI Agents**: Start with [`AGENTS.md`](./AGENTS.md) for project orientation, then use the priority and status fields below to determine what to work on. Read constraints and acceptance criteria fully before starting. Reference `DECISIONS.md` for decision rationale.

---

## Next Up

### Parallel batch generation with rate-limit handling

- **Priority**: High
- **Status**: Not started
- **Why**: Assets are currently processed sequentially in `BatchGenerator`. This is the main bottleneck for large packs (16+ assets). A pack with 16 sprites takes ~10 minutes sequentially.
- **Constraints**:
    - Gemini API has rate limits (requests per minute varies by tier). Must detect 429 responses and back off.
    - OpenAI fallback has separate rate limits.
    - Must preserve deterministic manifest output order regardless of processing order.
    - Error handling: one failed asset should not abort the entire batch.
- **Approach**: Configurable concurrency (default: 3). Use a semaphore or p-limit pattern. Retry with exponential backoff on rate-limit errors.
- **Acceptance criteria**:
    - `generate` command processes assets concurrently up to configurable limit
    - Rate-limit errors trigger automatic retry with backoff
    - Manifest output order matches config order (not completion order)
    - Single asset failure is logged and skipped, rest of batch continues
    - Existing sequential behavior works unchanged when concurrency is set to 1

### Cross-platform BMP conversion

- **Priority**: High
- **Status**: Not started
- **Why**: The `sips` fallback for BMP-to-PNG conversion only works on macOS. CI (Linux) and Windows users hit a dead path. This blocks adoption outside macOS.
- **Constraints**:
    - `sharp` can handle most conversions, but some legacy BMP formats (OS/2, RLE-compressed) need special handling.
    - Adding ImageMagick as a dependency is undesirable (heavy, requires system install).
    - Must not break existing macOS behavior.
- **Approach**: Try `sharp` first for all BMP conversions. Only fall back to `sips` on macOS if sharp fails. Log a clear error on Linux/Windows if neither works.
- **Acceptance criteria**:
    - BMP conversion works on macOS, Linux, and Windows with sharp alone for standard BMP formats
    - `sips` fallback remains available on macOS for edge cases
    - Clear error message when conversion fails on non-macOS systems

---

## Planned

### Automated style quality scoring

- **Priority**: Medium
- **Status**: Not started
- **Why**: Style reference quality depends entirely on prompt iteration and manual visual judgment. There's no programmatic way to evaluate whether a generated style reference is "good enough" before committing to a full batch generation.
- **Constraints**:
    - Quality is inherently subjective, but measurable proxies exist (color count, palette consistency with source, silhouette preservation, edge sharpness).
    - Should not add significant latency to the explore loop.
    - Must work without additional API calls (image analysis should be local).
- **Approach**: Score based on: (1) palette size within target range, (2) alpha channel cleanliness, (3) structural similarity (SSIM) to source silhouette, (4) absence of AI artifacts (checkerboard, blur halos). Return a composite score + per-metric breakdown.
- **Acceptance criteria**:
    - `explore` and `explore-once` output a quality score alongside the generated reference
    - Score is broken down into named metrics
    - Configurable threshold for auto-accept in `explore` loop
    - All scoring runs locally (sharp + image-q based, no API calls)

### Plugin system for custom post-processors

- **Priority**: Medium
- **Status**: Not started
- **Why**: The current `PixelArtPostProcessor` is hardcoded with a specific pipeline (alpha binarization → crop → quantize → downscale → cleanup). Different game projects may need different post-processing: dithering, outline generation, color remapping, tile alignment.
- **Constraints**:
    - Must not break the existing default pipeline.
    - Plugins receive a sharp image buffer and return a sharp image buffer.
    - Plugin order matters. Config must define execution order.
    - Must be loadable from local paths (not just npm packages).
- **Approach**: `postProcessors` config field accepting an array of plugin paths/names. Each plugin exports a function `(image: Sharp, context: AssetContext) => Promise<Sharp>`. Built-in steps become default plugins that can be reordered or removed.
- **Acceptance criteria**:
    - Custom post-processor can be loaded from a local `.ts`/`.js` file
    - Default pipeline is preserved when no custom processors are configured
    - Plugins are executed in config-defined order
    - Plugin errors are caught and reported per-asset without crashing the batch

### Animated output support (GIF / APNG)

- **Priority**: Medium
- **Status**: Not started
- **Why**: Currently only static PNG spritesheets are supported. Some projects need animated GIF or APNG files directly (web previews, documentation, Discord assets).
- **Constraints**:
    - Input is still a spritesheet (individual frames extracted from the source).
    - Frame timing should be configurable per asset.
    - GIF has a 256-color palette limit (fits pixel art well). APNG supports full RGBA.
    - sharp does not natively produce animated GIF/APNG — may need an additional dependency.
- **Approach**: Add `outputFormat: "png" | "gif" | "apng"` to asset config. Default remains `"png"` (spritesheet). For animated formats, extract frames from the generated spritesheet and assemble using a lightweight library.
- **Acceptance criteria**:
    - `outputFormat: "gif"` produces an animated GIF from spritesheet frames
    - `outputFormat: "apng"` produces an animated PNG
    - Frame duration is configurable per asset (default: 100ms)
    - Default behavior (static PNG spritesheet) is unchanged

### Test coverage for core pipeline

- **Priority**: Medium
- **Status**: Not started
- **Why**: vitest is configured but there are no test files yet. Core logic (config loading, post-processing, prompt building, manifest writing) is testable without AI API calls.
- **Constraints**:
    - AI-dependent code paths (image generation) need mocking or a separate integration test flag.
    - Test fixtures (sample images) should be small and committed to the repo.
    - Tests must run in CI (Linux, no macOS-only dependencies).
- **Approach**: Start with unit tests for: `config.ts` (loading, validation, path resolution), `PixelArtPostProcessor` (each pipeline step), `BatchGenerator` (prompt building only, mock the AI client), `AssetPackWriter` (manifest structure). Add a `test/fixtures/` directory with minimal test images.
- **Acceptance criteria**:
    - Tests exist for config loading, post-processing, prompt building, and manifest writing
    - All tests pass in CI (Linux)
    - No tests require API keys or network access
    - Coverage badge can be added to README

---

## Future Ideas

These are not committed plans. They may become planned items based on community interest.

- **Advanced spritesheet support** — Texture atlas packing (multiple assets into one sheet), atlas JSON/XML export, automatic frame detection from unmarked sheets, and configurable padding/extrusion for seamless rendering.
- **Tool file import/export** — Read and write native formats from popular gamedev tools: Aseprite (`.ase`/`.aseprite`), Tiled (`.tmx`/`.tsx`), TexturePacker (`.tps` + atlas JSON), Piskel, etc. Import existing project files as asset configs instead of manual JSON/YAML authoring. Export restyled assets back into tool-native formats.
- **Web UI with graphical workflow builder** — Browser-based interface for building custom asset pipelines visually. Drag-and-drop nodes for source input, AI generation, post-processing steps, and output. Execute workflows from the UI. Browser-based `explore` flow with side-by-side preview. Could evolve into the primary interface for non-CLI users and enable sharing of workflow templates.
- **Gemini SDK migration** — Replace raw `fetch` calls with official SDK when a stable, lightweight one is available.
- **Multi-model A/B generation** — Generate with multiple providers simultaneously, let user pick the best result.
- **Tilemap support** — Restyle tilesheets with seamless edge continuity constraints.
- **Prompt presets library** — Curated prompt templates for common styles (16-bit SNES, GBA, modern indie, etc.).

---

## Out of Scope

These are explicitly not goals for this project:

- **Runtime sprite rendering** — This package generates assets at build time. Runtime rendering is the game engine's job.
- **Vector/layered source formats** (SVG, PSD) — Source files are raster images. Tool file support (Aseprite, Tiled, etc.) is a future idea, but raw vector/layered formats are out of scope.
- **Cloud service / SaaS** — This is a local CLI/library tool. No hosted API, no accounts, no telemetry.
- **Training or fine-tuning models** — We consume existing AI APIs, not train our own.
