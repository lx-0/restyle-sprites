# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public issue.**

Instead, use GitHub's private vulnerability reporting:

1. Go to [Security → Advisories → New draft advisory](https://github.com/lx-0/restyle-sprites/security/advisories/new)
2. Describe the vulnerability and its potential impact
3. Include steps to reproduce if possible

You should receive a response within 7 days. If the vulnerability is confirmed, a fix will be prioritized and a security advisory published with the patch release.

## Scope

This policy covers the `restyle-sprites` npm package and its source code. It does not cover third-party dependencies — please report those to the respective maintainers.

## Security Measures

This project uses:

- [Gitleaks](https://github.com/gitleaks/gitleaks) in CI to prevent accidental secret commits
- npm provenance on published packages
- Dependency pinning via `pnpm-lock.yaml`
