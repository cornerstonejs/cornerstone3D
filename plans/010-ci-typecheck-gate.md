# Plan 010: Add a typecheck + api-check gate to CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- .github/workflows package.json`
> If these changed since this plan was written, compare the "Current state"
> excerpts against the live files before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

No CI workflow runs a TypeScript typecheck. PR gates are: jest+karma
(`test.yml`), Playwright screenshots, oxlint+prettier (`format-check.yml`),
CodeQL, and packaging validation (`validate-packaging.yml`, which runs
`pnpm run build` — the only implicit type validation, and only on packaging-
related triggers). Each package also defines an `api-check` script
(api-extractor) that no workflow invokes, so public-API drift is unenforced.
A dedicated, always-on PR job makes type errors and API-surface changes fail
fast instead of surfacing at build/publish time. This also unblocks the other
plans in this set — it is the missing verification baseline for refactors.

## Current state

- `.github/workflows/test.yml` — PR-triggered; steps: checkout → pnpm/action-setup → setup-node (`node-version: '24.15.0'`, `cache: 'pnpm'`) → `pnpm install --frozen-lockfile` → `pnpm run test:unit` → `pnpm run test:ci`. This is the structural exemplar for the new job.
- Root `package.json` scripts (verified):
  - `"api-check": "pnpm -r --filter=!docs run api-check"`
  - `"build": "pnpm -r --filter=!docs run build && pnpm --filter @cornerstonejs/dicom-image-loader run build:loader"`
  - `"build:esm": "pnpm -r --filter=!docs run build:esm"`
  - There is NO `typecheck` script at root or in any package.
- Per-package `build:esm` runs `tsc --project ./tsconfig.json` plus tsc-alias and a dist-package-json writer — i.e. the repo's real typecheck IS the tsc in `build:esm`; packages likely depend on each other's built `dist` (workspace deps), so a bare `tsc --noEmit` per package may fail on unresolved workspace imports unless upstream packages are built first. Simplest reliable gate: `pnpm run build:esm` at root (recursive, dependency-ordered by pnpm).
- `api-check` per package: `api-extractor --debug run` (e.g. `packages/core/package.json:83`). api-extractor consumes built type declarations, so it must run AFTER the build.
- Existing workflows use concurrency groups (see `format-check.yml`): copy that block.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Typecheck (the gate itself) | `pnpm run build:esm` | exit 0 |
| API check | `pnpm run api-check` | exit 0 |
| Workflow syntax check | `gh workflow list` after push, or `actionlint .github/workflows/typecheck.yml` if actionlint is available; otherwise YAML-parse: `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/typecheck.yml'))"` | no errors |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/typecheck.yml` (create)

**Out of scope** (do NOT touch, even though they look related):
- Adding `tsc --noEmit` scripts to every package — nice-to-have, but redundant with `build:esm` and 12 packages of churn; deferred.
- `.husky/pre-commit` / lint-staged — local-hook changes are a separate decision (they slow every commit).
- Existing workflows (`test.yml`, `format-check.yml`, `validate-packaging.yml`) — do not fold the new job into them; a separate workflow keeps failure signals distinct.
- `.oxlintrc.json` (plan 011).

## Git workflow

- Branch: `advisor/010-ci-typecheck-gate`
- Commit message style: `ci: add typecheck and api-check gate on PRs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the gate commands pass locally on a clean tree

Run `pnpm install --frozen-lockfile`, then `pnpm run build:esm`, then
`pnpm run api-check`. All three must exit 0 BEFORE you add the workflow — if
`api-check` fails on the current main (stale api-extractor baselines), record
which packages fail and add only the build step to the workflow, noting
api-check as blocked in your report (do NOT regenerate api baselines yourself).

**Verify**: exit codes captured; decision recorded (both steps vs build-only).

### Step 2: Create the workflow

`.github/workflows/typecheck.yml`, modeled exactly on `test.yml`'s setup steps
(same action versions — read them from `test.yml` at execution time and reuse:
currently `actions/checkout@v6.0.3`, `pnpm/action-setup@v6.0.8`,
`actions/setup-node@v6.4.0` with `node-version: '24.15.0'` and `cache: 'pnpm'`),
plus the concurrency block from `format-check.yml`:

```yaml
name: Typecheck

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

on:
  pull_request:
  workflow_dispatch:

jobs:
  typecheck:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6.0.3
      - uses: pnpm/action-setup@v6.0.8
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: '24.15.0'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Typecheck (tsc via build:esm)
        run: pnpm run build:esm
        env:
          NODE_OPTIONS: --max_old_space_size=8192
      - name: API surface check
        run: pnpm run api-check
```

Drop the last step if Step 1 said api-check is currently red.

**Verify**: the YAML-parse command from the table → no errors.

## Test plan

CI workflows are verified by execution: after the operator pushes the branch /
opens a PR, confirm the `Typecheck` check appears and is green. Locally, the
Step 1 command runs are the test.

## Done criteria

- [ ] `.github/workflows/typecheck.yml` exists, YAML-valid, mirrors repo action versions
- [ ] `pnpm run build:esm` exits 0 locally
- [ ] `pnpm run api-check` exits 0 locally OR its exclusion is documented in the report and the plans/README.md row
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm run build:esm` fails on the untouched checkout — main is broken or the
  environment is missing something (node 24 required: check `node --version`);
  report the error verbatim.
- `api-check` failures look like real API regressions rather than stale
  baselines — report, don't "fix" baselines.
- Build takes > 25 minutes locally — the CI timeout needs adjusting; report timing.

## Maintenance notes

- Reviewer: confirm the job runs on `pull_request` with no branch filter (matching `test.yml`).
- Follow-up candidates (deferred): per-package `typecheck` scripts using `tsc --noEmit` with project references for faster incremental gating; wiring `api-check` into `release.yml` so publishes are also gated; GitHub Actions cache for the tsc build.
- Interaction: plans 001–009 all use `build:esm` as their local verification — once this lands, their CI story is automatic.
