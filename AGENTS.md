# restyle-sprites

AI-powered sprite restyling pipeline. Keeps source geometry and gameplay readability while applying a new visual style via Gemini/OpenAI image generation.

## Build & Test

```bash
pnpm install
pnpm typecheck     # TypeScript strict, zero errors required
pnpm build         # tsc output to dist/
pnpm test          # vitest (tests are being added, may be empty)
```

## Code Conventions

- TypeScript strict mode. No `any`, no implicit returns, no unused variables.
- ESM only (`import`/`export`). No `require`.
- Build: straight `tsc`, no bundler.
- Error handling: throw descriptive errors early. Never swallow silently.
- Comments: only non-obvious *why*. Never narrate what code does.
- TSDoc required on every exported function and class (`@param`, `@returns`, `@throws`, `@example`).
- Reference decision IDs in TSDoc where relevant (`@see DEC-001`).

## Architecture (10 files in `src/`)

- `cli.ts` — CLI entry point (`explore`, `explore-once`, `generate`, `init-default`)
- `config.ts` — JSON/YAML config loader. Paths resolve relative to config file, not CWD (DEC-003).
- `types.ts` — All shared types. `metadata` is free-form passthrough (DEC-002).
- `index.ts` — Public API re-exports.
- `OpenAIImageClient.ts` — Gemini primary, OpenAI fallback (DEC-001). Checkerboard sanitizer.
- `ImageProcessor.ts` — Image I/O, upscale/downscale, frame extraction, stitching (DEC-004).
- `PixelArtPostProcessor.ts` — Pipeline: alpha binarize → crop → quantize → resize → cleanup (DEC-004).
- `BatchGenerator.ts` — Per-asset generation with structured prompt building. Two-layer prompts (global style + per-asset hint).
- `StyleExplorer.ts` — Interactive style reference exploration loop.
- `AssetPackWriter.ts` — Writes `manifest.json` per pack + `index.json` at packs root.

## Key Decisions

Read `DECISIONS.md` for full rationale. Summary:

- **DEC-001**: Gemini-first, OpenAI fallback. Always try Gemini first.
- **DEC-002**: Engine-agnostic metadata. `metadata` field passes through unchanged.
- **DEC-003**: Config-relative paths. All paths resolve from config file directory.
- **DEC-004**: Upscale-render-downscale. Tiny sprites upscale to 256/512/1024 before AI, nearest-neighbor back down after.

## PR Checklist

Before submitting:

1. `pnpm typecheck` — zero errors.
2. `pnpm build` — compiles clean.
3. `pnpm test` — all tests pass.
4. Add a changeset: `pnpm changeset` (skip for docs-only changes).
5. TSDoc on any new/changed public API.
6. Tests for any new/changed behavior.
7. Update docs if architecture or decisions changed.

## Decision Impact

Every PR must declare decision impact:

- **None**: no architecture decision touched.
- **Implements existing**: references `DEC-xxx`.
- **Proposes new**: adds `DEC-xxx` with `Status: proposed` in `DECISIONS.md`.

Non-trivial architecture changes require a decision entry. Only `@lx-0` marks decisions as `accepted`.

## Governance

Founder mode. Intentionally lean.

- **Owner / decision authority**: `@lx-0`
- **AI implementation agent**: `@Moss8GB`

## Reading Order

For deeper context beyond this file:

1. `ROADMAP.md` — current priorities, constraints, and acceptance criteria. Start here for what to work on.
2. `DECISIONS.md` — architecture decisions with rationale. Check before changing provider logic, config schema, or pipeline order.
3. `CONTEXT.md` — static background and module dependency graph.
4. `CONTRIBUTING.md` — full dev workflow, testing philosophy, documentation standards.
5. `src/*.ts` — inline TSDoc is source of truth for implementation details.

## Gotchas

- `sips` BMP fallback only works on macOS. On Linux/Windows, `sharp` must handle conversion alone.
- Gemini API is called via raw `fetch`, not an SDK.
- Checkerboard detection can over-strip near-gray content at image edges.
- No parallelism in batch generation yet (sequential to avoid rate limits).
- `metadata` is never validated — it passes through as-is to manifests.
- `.env` is loaded from the config file's directory, not CWD.
