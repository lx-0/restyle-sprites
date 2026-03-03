<div align="center">

# restyle-sprites

**AI-powered sprite restyling pipeline for generating cohesive game asset packs.**

Keep source geometry and gameplay readability — apply a completely new visual style.

[![npm version](https://img.shields.io/npm/v/restyle-sprites?style=flat-square&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/restyle-sprites)
[![npm downloads](https://img.shields.io/npm/dm/restyle-sprites?style=flat-square&color=cb3837)](https://www.npmjs.com/package/restyle-sprites)
[![license](https://img.shields.io/npm/l/restyle-sprites?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/lx-0/restyle-sprites/ci.yml?style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/lx-0/restyle-sprites/actions/workflows/ci.yml)

</div>

---

## How It Works

```
Source Sprite + Style Reference + Prompt  →  AI Generation  →  Post-Processing  →  Styled Asset Pack
```

1. **Explore** — iteratively generate a style reference from sample sprites + your prompt
2. **Generate** — batch-restyle every configured asset using source + style reference + structured prompts
3. **Post-process** — alpha cleanup, palette quantization (max 24 colors), nearest-neighbor downscale, hard pixel edges

---

## Features

- 🎨 **Restyle pipeline** — source asset + style reference + prompt
- 🔍 **Interactive exploration** — style reference preview loop with approval flow
- 📦 **Batch generation** — images and spritesheets in one run
- 🖼️ **Pixel-art post-processing** — palette quantization, alpha cleanup, nearest-neighbor resize
- 🎭 **Legacy colorkey stripping** — for opaque source files (old BMP assets with magenta/green backgrounds)
- 📝 **JSON & YAML config** — all paths resolved relative to config file
- 🤖 **Multi-provider AI** — Gemini primary, OpenAI fallback
- 🎮 **Engine-agnostic** — free-form `metadata` field per asset, passes through to manifests untouched

---

## Install

```bash
npm install restyle-sprites
```

```bash
pnpm add restyle-sprites
```

## Quick Start

```bash
# 1. Set up environment
echo "GEMINI_API_KEY=..." > .env
echo "OPENAI_API_KEY=..." >> .env  # optional fallback

# 2. Create config (or use examples/restyle.config.json as a starting point)
restyle-sprites init-default --config ./restyle.config.json

# 3. Explore styles interactively
restyle-sprites explore --name my-pack --config ./restyle.config.json

# 4. Generate the full pack
restyle-sprites generate --name my-pack --config ./restyle.config.json
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Primary AI provider |
| `OPENAI_API_KEY` | No | Fallback provider |
| `GEMINI_IMAGE_MODEL` | No | Default: `gemini-3.1-flash-image-preview` |

---

## CLI

```bash
restyle-sprites <command> [options]
```

| Command | Description |
|---|---|
| `explore` | Interactive style preview loop and approval flow |
| `explore-once` | One-shot style reference generation |
| `generate` | Generate all configured assets into one pack |
| `init-default` | Convert source assets to a baseline `default` pack |

All commands accept `--name <pack>` and `--config <path>`.

---

## Config

All paths are resolved relative to the config file directory. Supports `.json` and `.yaml`.

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
      "metadata": { "engineKey": "hero_walk" }
    }
  ]
}
```

> See `examples/restyle.config.json` and `examples/restyle.config.yaml` for full working setups.

---

## Programmatic Usage

```ts
import {
  loadConfig,
  BatchGenerator,
  ImageProcessor,
  OpenAIImageClient,
  PixelArtPostProcessor,
} from 'restyle-sprites';
```

---

## CI & Security

This project ships with GitHub Actions workflows for CI and automated releases.

**CI** (`.github/workflows/ci.yml`):
- Build + typecheck (`pnpm typecheck`, `pnpm build`)
- Secret detection via [Gitleaks](https://github.com/gitleaks/gitleaks)

**Release** (`.github/workflows/release.yml`):
- Automated release PRs via [Changesets](https://github.com/changesets/changesets)
- Version bumps + changelog generation
- npm publish with provenance

**Branch protection** — require these checks on `main`:
- `Build And Typecheck`
- `Secret Detection (Gitleaks)`

---

## Changelog

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# Add a changeset to your PR
pnpm changeset
```

Merge to `main` → release PR is created → merge release PR → published to npm.

See [`RELEASING.md`](./RELEASING.md) for the full runbook.

---

## Roadmap

- [ ] Parallel batch generation with rate-limit handling
- [ ] Cross-platform BMP conversion (remove macOS-only `sips` dependency)
- [ ] Automated style quality scoring
- [ ] Plugin system for custom post-processors
- [ ] Animated output support (GIF / APNG)
- [ ] Test coverage for core pipeline
- [ ] Advanced spritesheet & texture atlas support
- [ ] Tool file import/export (Aseprite, Tiled, TexturePacker, ...)
- [ ] Web UI with graphical workflow builder

See [`ROADMAP.md`](./ROADMAP.md) for full details, priorities, and acceptance criteria.

---

## Contributing

Contributions are welcome — from humans, AI agents, or both working together.

- **AI agents**: Start with [`AGENTS.md`](./AGENTS.md) — the primary entry point for all agent contributors.
- **Everyone**: See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev setup, workflow, and guidelines.

---

## Notes

- For very small sprites, the pipeline upscales before generation and downsamples with nearest-neighbor.
- `metadata` is copied through to generated manifest entries unchanged.
- Output pack manifests are written as `<outputDir>/<packName>/manifest.json`, and `<outputDir>/index.json` is refreshed after each command.

---

<div align="center">

**[npm](https://www.npmjs.com/package/restyle-sprites)** · **[GitHub](https://github.com/lx-0/restyle-sprites)** · **[Issues](https://github.com/lx-0/restyle-sprites/issues)**

</div>
