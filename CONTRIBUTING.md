# Contributing to restyle-sprites

Contributions are welcome — from humans, AI agents, or both working together.

This project embraces AI-driven development. If an AI agent wrote the code, great. If you pair-programmed with one, also great. If you wrote every line by hand, equally great. What matters is that the result works, passes CI, and you can stand behind what you submit.

## Getting Started

```bash
git clone https://github.com/lx-0/restyle-sprites.git
cd restyle-sprites
pnpm install
pnpm build
pnpm typecheck
```

### Project Structure

```text
src/
  cli.ts                    # CLI entry point
  config.ts                 # Config loader + validator
  types.ts                  # Shared types
  index.ts                  # Public API re-exports
  OpenAIImageClient.ts      # AI image generation (Gemini primary, OpenAI fallback)
  ImageProcessor.ts         # Image I/O, upscale, frame extraction, stitching
  PixelArtPostProcessor.ts  # Alpha cleanup, palette quantization, colorkey stripping
  BatchGenerator.ts         # Per-asset generation orchestrator
  StyleExplorer.ts          # Interactive style reference exploration
  AssetPackWriter.ts        # Manifest + index writer
```

For full orientation, see:

- [`CONTEXT.md`](./CONTEXT.md) for static background and architecture overview
- [`DECISIONS.md`](./DECISIONS.md) for iterative architecture decisions
- [`ROADMAP.md`](./ROADMAP.md) for current priorities and acceptance criteria

## Before You Start

1. Check the [Roadmap](./ROADMAP.md) for priorities and what's in progress.
2. For non-trivial changes, open an issue first to discuss the approach.
3. Keep PRs focused — one feature or fix per PR.

## Development Workflow

1. Create a branch from `main`.
1. Make your changes.
1. Run checks locally:

```bash
pnpm typecheck    # TypeScript strict mode
pnpm build        # Compile to dist/
pnpm test         # Run tests (when available)
```

1. Add a changeset:

```bash
pnpm changeset
```

Choose bump type (`patch`, `minor`, `major`) and write a short summary of what changed and why.

1. Commit and open a PR against `main`.

## Code Style

- **TypeScript strict mode** — no `any`, no implicit returns, no unused variables.
- **ESM only** — `import`/`export`, no `require`.
- **Minimal comments** — code should be self-explanatory. Comment *why*, not *what*.
- **Error handling** — throw descriptive errors early. Don't silently swallow failures.
- **No bundler** — straight `tsc` output. Keep it simple.

## Documentation

In an AI-first project, documentation is not an afterthought — it's the primary interface for agents to understand and contribute to the codebase.

### Types as Documentation

Types are the most reliable documentation. An agent reading `types.ts` should understand the data model without looking at any other file.

- All public API types go in `types.ts` with TSDoc comments explaining purpose and constraints.
- Use descriptive type names and union types over loose strings/numbers.
- If a type has non-obvious invariants (e.g. "frameCount must equal width / frameWidth"), document them in TSDoc.

### TSDoc on Public API

Every exported function and class must have a TSDoc comment covering:

- **What** it does (one line)
- **Parameters** with `@param` — what they expect, valid ranges, defaults
- **Returns** with `@returns` — what the caller gets back
- **Throws** with `@throws` — when and why it fails
- **Example** with `@example` — for non-trivial usage

```ts
/**
 * Load and validate a restyle config from a JSON or YAML file.
 *
 * @param configPath - Absolute or relative path to the config file.
 *   Supports `.json` and `.yaml`/`.yml` extensions.
 * @returns Parsed and validated config with all paths resolved to absolute.
 * @throws {Error} If the file does not exist or fails validation.
 *
 * @example
 * const config = await loadConfig('./restyle.config.json');
 */
```

This is not bureaucracy — it's how agents learn your API without reading the implementation.

### Architecture Documentation

- **`CONTEXT.md`** — static background + architecture orientation. Update only when the overall context or high-level module map changes.
- **`DECISIONS.md`** — living architecture decision log. Add a new `DEC-xxx` entry when a decision changes implementation direction.
- **`ROADMAP.md`** — direction and priorities. Update when items are completed, reprioritized, or added.
- **Inline TSDoc in `src/`** — source of truth for implementation behavior and module-level details.
- **Inline comments** — only for non-obvious *why* decisions: tricky algorithms, workarounds, performance trade-offs. Never narrate what the code does.

### Lean Governance (Current Stage)

This project currently runs in founder mode:

- **Owner / final decision authority**: `@lx-0`
- **AI implementation agent**: `@Moss8GB`

Decision process:

1. For non-trivial architecture changes, add/update a `DEC-xxx` entry in `DECISIONS.md` with `Status: proposed`.
1. Discuss in the PR/issue.
1. `@lx-0` marks it `accepted` (or superseded later by a newer DEC).

## Testing

Tests serve two purposes in this project: they **verify correctness** and they **specify behavior**. An agent reading the tests should understand what the code is supposed to do.

### Philosophy

- **Tests as specification** — test descriptions should read like requirements. An agent contributing a new feature should be able to read existing tests and understand the expected behavior patterns.
- **Tests as guardrails** — every PR that changes behavior should include tests that would have caught a regression. Agents must run tests before and after their changes.
- **No manual verification** — everything must be automatable. No "visually inspect the output" steps.

### What to Test

- **Config (`config.ts`)**: loading, validation, path resolution, and error cases. Use unit tests with fixture files.
- **Post-processing (`PixelArtPostProcessor.ts`)**: each pipeline step in isolation plus the full pipeline. Use unit tests with small fixture images.
- **Prompt building (`BatchGenerator.ts`)**: prompt structure, category context, and palette extraction. Use unit tests with a mocked AI client.
- **Manifest writing (`AssetPackWriter.ts`)**: output structure, index refresh, and edge cases. Use unit tests with temporary directories.
- **CLI (`cli.ts`)**: argument parsing, command routing, and error output. Use integration tests.
- **AI generation (`OpenAIImageClient.ts`)**: retry logic, fallback chain, and error handling. Use unit tests with mocked HTTP.

### What Not to Test

- Don't test third-party libraries (sharp, image-q, inquirer).
- Don't test AI output quality — that's inherently non-deterministic.
- Don't write tests that require API keys or network access in CI.

### Test Style

```ts
describe('PixelArtPostProcessor', () => {
  describe('alpha binarization', () => {
    it('converts semi-transparent pixels to fully opaque', async () => {
      // ...
    });

    it('preserves fully transparent pixels', async () => {
      // ...
    });
  });
});
```

- Descriptive `describe`/`it` blocks that read as behavior specifications.
- One assertion per test when possible.
- Test fixtures in `test/fixtures/` — committed to the repo, small as possible.
- Use `vitest` — already configured.

### Running Tests

```bash
pnpm test          # run all tests
pnpm test -- --watch   # watch mode during development
```

## PR Expectations

CI must pass before merge:

- `Build And Typecheck` — `pnpm typecheck` + `pnpm build`
- `Secret Detection (Gitleaks)` — no secrets in the codebase

Your PR should include:

- [ ] A changeset (unless it's docs-only or CI-only)
- [ ] Types with TSDoc for any new public API
- [ ] Tests for new or changed behavior
- [ ] Updated docs as needed (`CONTEXT.md`, `DECISIONS.md`, `ROADMAP.md`, inline TSDoc)

## For AI Agents

Start with [`AGENTS.md`](./AGENTS.md) — it is the primary entry point for all AI agents working on this project. It contains build commands, architecture overview, conventions, gotchas, and a reading order for deeper context.

Everything below is a summary. `AGENTS.md` is your source of truth.

- Follow acceptance criteria from `ROADMAP.md` exactly — they are your definition of done.
- Run `pnpm typecheck`, `pnpm build`, and `pnpm test` before submitting. Fix all errors.
- Add TSDoc to every public function you create or modify.
- Write tests that specify the behavior you're implementing.
- Add a changeset with a clear summary of the change.
- If a ROADMAP item has constraints, respect them. If you think a constraint should change, note it in the PR description.
- Declare decision impact in every PR (none / implements existing DEC / proposes new DEC).

## Versioning

- `patch` — bug fixes, non-breaking internal improvements
- `minor` — new backward-compatible features
- `major` — breaking changes to API, CLI, or config format

## Questions?

Open an [issue](https://github.com/lx-0/restyle-sprites/issues) or start a [discussion](https://github.com/lx-0/restyle-sprites/discussions).
