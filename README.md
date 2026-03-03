# restyle-sprites

AI-powered sprite restyling pipeline for generating cohesive game asset packs from legacy source sprites.

It focuses on one hard problem: keep source geometry and gameplay readability while applying a new style.

## Features

- Restyle pipeline: source asset + style reference + prompt
- Interactive style reference exploration (`explore`)
- Batch generation for image and spritesheet assets
- Pixel-art post-processing (palette quantization, alpha cleanup, nearest-neighbor resize)
- Legacy colorkey stripping support for opaque source files (for example old BMP assets)
- JSON and YAML config support
- Provider setup: Gemini primary, OpenAI fallback
- Engine-agnostic metadata support (`metadata` field per asset)

## Install

```bash
npm install restyle-sprites
```

or with pnpm:

```bash
pnpm add restyle-sprites
```

## Quick Start

1. Create a config file (`restyle.config.json` or `.yaml`).
2. Add API keys to `.env` in the same directory as the config.
3. Generate a style reference.
4. Generate the full pack.

### Environment variables

```bash
GEMINI_API_KEY=...
OPENAI_API_KEY=...
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
```

`OPENAI_API_KEY` is optional, used as fallback.

## CLI

```bash
restyle-sprites explore --name my-pack --config ./restyle.config.json
restyle-sprites explore-once --name my-pack --config ./restyle.config.json --prompt "pixel-art fantasy"
restyle-sprites generate --name my-pack --config ./restyle.config.json
restyle-sprites init-default --config ./restyle.config.json
```

### Commands

- `explore`: interactive style preview loop and approval flow
- `explore-once`: one-shot style reference generation
- `generate`: generate all configured assets into one pack
- `init-default`: convert source assets to a baseline `default` pack

## Config format

All paths are resolved relative to the config file directory.

```json
{
  "outputDir": "./public/assets/packs",
  "defaultActivePack": "default",
  "sampleSprites": [
    "./public/assets/sprites/hero.png",
    "./public/assets/sprites/tree.png"
  ],
  "assets": [
    {
      "id": "hero_walk",
      "sourceFile": "./public/assets/sprites/hero_walk.png",
      "outputFile": "sprites/hero_walk.png",
      "kind": "spritesheet",
      "category": "character",
      "width": 96,
      "height": 32,
      "frameWidth": 32,
      "frameHeight": 32,
      "frameCount": 3,
      "frameDirection": "horizontal",
      "promptHint": "Hero walk cycle, three frames, preserve silhouette.",
      "metadata": {
        "engineKey": "hero_walk"
      }
    }
  ]
}
```

## Programmatic usage

```ts
import { loadConfig, BatchGenerator, ImageProcessor, OpenAIImageClient, PixelArtPostProcessor } from 'restyle-sprites';
```

For a full working setup, check:

- `examples/restyle.config.json`
- `examples/restyle.config.yaml`

## CI And Security

The package includes a GitHub Actions workflow at `.github/workflows/ci.yml` with:

- build + typecheck (`pnpm typecheck`, `pnpm build`)
- secret detection using Gitleaks on every push and pull request

Release automation is configured with:

- `.github/workflows/release.yml` using Changesets
- automatic release PRs with version bumps and changelog updates
- npm publish to the public registry using `NPM_TOKEN`

Detailed release runbook: `RELEASING.md`

## PR Blocking Policy

Use GitHub branch protection (or rulesets) on `main` and require these status checks:

- `Build And Typecheck`
- `Secret Detection (Gitleaks)`

This ensures no PR can be merged unless CI is green.

## Changelog generation

This package uses Changesets for versioning and changelog generation.

Basic flow:

1. Add a changeset in your PR:

   ```bash
   pnpm changeset
   ```

2. Merge PR to `main`.
3. Release workflow opens/updates a release PR with:
   - bumped version in `package.json`
   - generated `CHANGELOG.md`
4. Merge release PR to publish to npm.

Required repository secret:

- `NPM_TOKEN` (npm automation token with publish permissions for `restyle-sprites`)

## Notes

- For very small sprites, the pipeline upscales before generation and downsamples with nearest-neighbor.
- `metadata` is copied through to generated manifest entries unchanged.
- Output pack manifests are written as `<outputDir>/<packName>/manifest.json`, and `<outputDir>/index.json` is refreshed after each command.
