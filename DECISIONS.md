# Architecture Decisions

This is the living log of iterative project decisions for `restyle-sprites`.

- `CONTEXT.md` provides static background and architecture orientation.
- `ROADMAP.md` captures future direction and priorities.
- `DECISIONS.md` captures decisions that shape implementation over time.

## Governance (Founder Mode)

Current project governance is intentionally lean:

- **Owner**: `@lx-0`
- **AI implementation agent**: `@Moss8GB`

Decision rules:

- Use `DECISIONS.md` for non-trivial architecture changes.
- New decisions start as `Status: proposed`.
- Only `@lx-0` marks a decision as `accepted` in founder mode.
- Add new entries at the end with the next decision ID.

Decision status values:

- `proposed`
- `accepted`
- `superseded`

Decision template:

```md
## DEC-00X: <Title>

- **Status**: proposed
- **Date**: YYYY-MM-DD
- **Owner**: @lx-0
- **Proposed-by**: @Moss8GB
- **Accepted-by**: (pending)
- **Decision**: <one sentence>
- **Rationale**: <why this over alternatives>
- **Supersedes**: DEC-00Y (optional)
- **Affected modules**:
    - `src/...`
```

## DEC-001: Gemini-first, OpenAI fallback

- **Status**: accepted
- **Date**: 2026-03-03
- **Owner**: @lx-0
- **Proposed-by**: @Moss8GB
- **Accepted-by**: @lx-0
- **Decision**: Use Gemini as the primary image generation provider and OpenAI as fallback when configured.
- **Rationale**: Gemini is the default generation path and keeps baseline behavior stable. OpenAI fallback improves resilience when Gemini fails or is unavailable and reduces hard dependency on one provider.
- **Affected modules**:
    - `src/OpenAIImageClient.ts`

## DEC-002: Engine-agnostic metadata passthrough

- **Status**: accepted
- **Date**: 2026-03-03
- **Owner**: @lx-0
- **Proposed-by**: @Moss8GB
- **Accepted-by**: @lx-0
- **Decision**: Keep asset metadata free-form (`Record<string, unknown>`) and pass it through unchanged into manifests.
- **Rationale**: Different game engines need different runtime keys and metadata shapes. A pass-through model avoids coupling this package to one engine contract.
- **Affected modules**:
    - `src/types.ts`
    - `src/AssetPackWriter.ts`
    - `src/cli.ts`
    - `src/BatchGenerator.ts`

## DEC-003: Config-relative path resolution

- **Status**: accepted
- **Date**: 2026-03-03
- **Owner**: @lx-0
- **Proposed-by**: @Moss8GB
- **Accepted-by**: @lx-0
- **Decision**: Resolve source and output paths relative to the config file directory, not the current working directory.
- **Rationale**: This keeps runs deterministic across monorepos, CI, and local environments, and allows configs to be portable regardless of invocation location.
- **Affected modules**:
    - `src/config.ts`
    - `src/cli.ts`
    - `src/BatchGenerator.ts`

## DEC-004: Upscale-render-downscale for tiny sprites

- **Status**: accepted
- **Date**: 2026-03-03
- **Owner**: @lx-0
- **Proposed-by**: @Moss8GB
- **Accepted-by**: @lx-0
- **Decision**: Upscale tiny sprites before generation and downscale after post-processing with nearest-neighbor.
- **Rationale**: Small sprites do not provide enough pixel information for reliable model output. Upscaling preserves structure for generation while nearest-neighbor downscale keeps crisp gameplay-size pixels.
- **Affected modules**:
    - `src/ImageProcessor.ts`
    - `src/BatchGenerator.ts`
    - `src/PixelArtPostProcessor.ts`
