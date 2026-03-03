# Context Handover: restyle-sprites

> North star document for developing `restyle-sprites` as a standalone npm package.
> Extracted from the parent project **Modern Wumpus** (`wumpusjs-gen`).

## Origin Story

`restyle-sprites` was extracted from the asset generator tool inside **Modern Wumpus**, a Phaser 3 life simulation where AI-driven creatures (Wumpuses) evolve in a dynamic environment. The tool's job was to restyle legacy BMP sprites (from the original 2003 C++/asm program `wumpus`) into cohesive modern pixel-art packs using AI image generation.

The extraction goal: make the pipeline **engine-agnostic** so any game project can use it, not just Phaser/Wumpus.

## What the Package Does

One hard problem: **keep source geometry and gameplay readability while applying a new visual style.**

Pipeline in a nutshell:

1. User provides a config file listing source sprites, dimensions, and prompt hints
2. `explore` command: iteratively generate a style reference image from sample sprites + user prompt
3. `generate` command: batch-restyle every asset using source sprite + style reference + structured prompt
4. Post-processing: alpha binarization, palette quantization (max 24 colors), nearest-neighbor downscale to exact gameplay size, hard pixel edge cleanup

## Architecture

```
src/
  cli.ts                   # CLI entry point (explore, explore-once, generate, init-default)
  config.ts                # JSON/YAML config loader + validator
  types.ts                 # All shared types (AssetDefinition, Manifest, Config)
  index.ts                 # Public API re-exports

  OpenAIImageClient.ts     # AI image generation (Gemini primary, OpenAI fallback)
  ImageProcessor.ts        # Image I/O, upscale, frame extraction, stitching
  PixelArtPostProcessor.ts # Alpha cleanup, palette quantization, legacy BG stripping
  BatchGenerator.ts        # Orchestrates per-asset generation with prompt building
  StyleExplorer.ts         # Interactive style reference exploration loop
  AssetPackWriter.ts       # Writes manifest.json + index.json for asset packs
```

### Key Design Decisions

- **Gemini-first, OpenAI fallback**: Gemini (`gemini-3.1-flash-image-preview`) is the primary image model. If Gemini fails and `OPENAI_API_KEY` is set, it falls back to OpenAI (`gpt-image-1.5` > `gpt-image-1` > `gpt-image-1-mini`).
- **Engine-agnostic metadata**: Assets carry a free-form `metadata?: Record<string, unknown>` field that passes through untouched to manifests. The parent Wumpus project uses `{ phaserKey: "..." }` there; other projects can put whatever they need.
- **Config-driven**: All paths resolve relative to the config file, not CWD. This makes the tool portable across monorepos.
- **Upscale-render-downscale**: Tiny sprites (e.g. 8x12 mouse) are upscaled with nearest-neighbor to 256/512/1024 before sending to the AI model, then downscaled back after post-processing. This gives the model enough pixel information to work with.

## Type System

```typescript
type AssetKind = 'image' | 'spritesheet';
type AssetCategory = 'character' | 'resource' | 'effect' | 'prop' | 'icon' | 'scene' | 'font';

interface AssetDefinitionBase {
  id: string;
  sourceFile: string;     // relative to config dir
  outputFile: string;     // relative to pack dir
  kind: AssetKind;
  category?: AssetCategory;
  width: number;
  height: number;
  promptHint: string;
  metadata?: Record<string, unknown>;
}

// Spritesheets add: frameWidth, frameHeight, frameCount, frameDirection
// Config root: { outputDir, assets[], sampleSprites[], defaultActivePack? }
```

## Prompt Engineering

Two-layer prompt structure:

1. **Global style prompt** – set during `explore`, stored in manifest description
2. **Per-asset hint** – from config `promptHint` field, injected automatically during `generate`

The `BatchGenerator` builds structured prompts with:
- Category-specific context (character animation continuity, icon readability at 16x16, scene composition preservation, etc.)
- Source palette hex constraint extracted from the original sprite
- Strict pixel-art rules (no AA, no blur, no gradients, hard edges, max 16-24 colors)
- Render size awareness ("output must survive nearest-neighbor downscale to WxH")
- Fallback prompt without style direction if moderation blocks the first attempt

## Post-Processing Pipeline

`PixelArtPostProcessor` applies (in order):

1. Legacy colorkey stripping (for old BMPs with opaque magenta/green backgrounds)
2. Alpha binarization (remove semi-transparent pixels)
3. Alpha-tight crop (remove excess empty space)
4. Palette quantization via `image-q` (max 24 colors by default)
5. Nearest-neighbor downscale to exact target dimensions
6. Final alpha edge cleanup

`OpenAIImageClient` also runs a checkerboard sanitizer on style references (flood-fill from edges to remove AI-generated transparency tile artifacts).

## The Parent Project (Wumpus) Integration

In `wumpusjs-gen`, the restyle-sprites pipeline is consumed as:
- Asset packs live in `public/assets/packs/<packName>/`
- Each pack has `manifest.json` with asset entries
- `public/assets/packs/index.json` lists available packs + active pack
- Runtime: Phaser loads sprites from `manifest.json`, keyed by `metadata.phaserKey`
- User can switch packs at runtime (persisted in localStorage, triggers scene restart)

The example config in `examples/restyle.config.json` shows the real Wumpus asset manifest with all 16 legacy sprites (wumpus family, resources, props, effects, scene, font).

## Tech Stack

- **Runtime**: Node.js 20+, ESM (`"type": "module"`)
- **Language**: TypeScript (strict mode)
- **Image processing**: sharp
- **Palette quantization**: image-q
- **Config parsing**: js-yaml (YAML support), native JSON
- **AI providers**: Gemini REST API (direct fetch), OpenAI SDK
- **CLI interaction**: inquirer
- **Build**: tsc (no bundler, straight ESM output)
- **Test**: vitest
- **Package manager**: pnpm
- **Versioning**: Changesets
- **CI**: GitHub Actions (build + typecheck + Gitleaks secret scan)
- **Release**: Changesets action (auto release PRs + npm publish with provenance)

## Environment Variables

```
GEMINI_API_KEY=...                              # Required (primary provider)
OPENAI_API_KEY=...                              # Optional (fallback provider)
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview  # Optional (default shown)
```

Loaded from `.env` in the config file's directory.

## npm Package

- **Name**: `restyle-sprites`
- **Registry**: <https://registry.npmjs.org>
- **Repo**: <https://github.com/lx-0/restyle-sprites>
- **Publish**: via Changesets GitHub Action with npm provenance
- **CLI binary**: `restyle-sprites`

## Known Limitations & Future Work

- `sips` fallback for BMP conversion only works on macOS; CI/Linux needs sharp-only path or ImageMagick
- No parallelism in batch generation (assets are processed sequentially to avoid API rate limits)
- Style reference quality depends heavily on prompt iteration; no automated quality scoring yet
- No unit tests for AI-dependent code paths (would need mocking or integration test flag)
- Gemini API is called via raw `fetch`; could benefit from a proper SDK if/when available
- No support for animated GIF/APNG output yet (only static PNG spritesheets)
- Checkerboard detection heuristic may over-strip near-gray content in edge cases

## Useful Links

- Parent project requirements: see `REQUIREMENTS.md` in `wumpusjs-gen`
- Detailed asset generator guide: see `docs/ASSET_GENERATOR.md` in `wumpusjs-gen`
- Style prompt presets: `examples/prompts/asset-style-presets.md` in `wumpusjs-gen`
- Release runbook: `RELEASING.md` in this repo
