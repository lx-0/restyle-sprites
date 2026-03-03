# Releasing `@yesterday-ai/restyle-sprites`

This document describes the release workflow using Changesets, GitHub Actions, and npm.

## Prerequisites

- Repository has `NPM_TOKEN` configured in GitHub Actions secrets.
- Branch protection is enabled for `main` with required checks:
  - `Build And Typecheck`
  - `Secret Detection (Gitleaks)`
- You have publish permissions for `@yesterday-ai` on npm.

## Normal Contributor Flow

For every user-facing change, add a changeset in your PR:

```bash
cd restyle-sprites
pnpm changeset
```

Choose the package (`@yesterday-ai/restyle-sprites`), bump type (`patch`, `minor`, `major`), and write a short summary.

Commit the generated file in `.changeset/` and open your PR.

## CI Expectations

On pull requests and pushes to `main`, CI runs:

- install dependencies
- `pnpm typecheck`
- `pnpm build`
- Gitleaks secret scan

PRs should not be merged unless all required checks are green.

## Release Automation

After merging PRs with changesets into `main`, the Release workflow:

1. creates or updates a Release PR
2. bumps package version in `package.json`
3. updates `CHANGELOG.md`

When the Release PR is merged:

1. package is published to npm
2. published version matches the changeset bump

## Manual Commands (Local, if needed)

Usually not required because GitHub Actions handles this.

```bash
cd restyle-sprites
pnpm install
pnpm version-packages
pnpm release
```

## Troubleshooting

### Release PR is not created

- Check that at least one `.changeset/*.md` file exists in `main`.
- Verify `.github/workflows/release.yml` is present and enabled.

### Publish fails with npm auth error

- Ensure `NPM_TOKEN` secret exists in the repository.
- Ensure token has permission to publish under `@yesterday-ai`.

### Publish fails with package access/name errors

- Confirm package name is `@yesterday-ai/restyle-sprites`.
- Confirm `publishConfig.access` is `public`.
- Confirm package scope permissions in npm org settings.

## Versioning Policy (Recommended)

- `patch`: bug fixes, docs-only behavioral clarifications, non-breaking internal improvements
- `minor`: new backward-compatible features
- `major`: breaking API/CLI/config changes
