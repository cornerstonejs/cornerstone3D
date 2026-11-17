# Plan 013: Add a non-blocking Firefox/WebKit Playwright lane to CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- .github/workflows/playwright.yml playwright.config.ts scripts/run-playright.sh`
> On drift, compare the "Current state" excerpts against the live files; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (cross-browser screenshot baselines will surface diffs)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

Cornerstone3D is a WebGL/canvas rendering library, yet CI exercises exactly one
engine: karma runs ChromeHeadless only, and all three Playwright matrix lanes
(legacy / compatibility / next) pass `--project=chromium` and install only
chromium. `playwright.config.ts` already defines `firefox` and `webkit`
projects — the infrastructure exists, it is just never run. Firefox/Safari
rendering regressions (WebGL context behavior, texture formats, canvas
readback) currently ship blind. A scheduled, initially non-blocking lane
surfaces them without destabilizing PR CI while baselines are triaged.

## Current state

- `.github/workflows/playwright.yml` (verified): PR-triggered, `runs-on: [nashua]` (self-hosted), matrix of 3 modes, each `run_args: '... --project=chromium'`, browser install step `pnpm exec playwright install chromium`, runs `./scripts/run-playright.sh` wrapped in `scripts/ci/with-nashua-lock.sh`, 120-minute timeout, `NODE_OPTIONS=--max_old_space_size=10192`.
- `playwright.config.ts` defines `firefox` and `webkit` projects (~lines 85–90 — read the exact project blocks before starting; note any device settings).
- `scripts/run-playright.sh` — the runner; forwards `--project=...` args. Read it to confirm arbitrary `--project` values pass through.
- Screenshot baselines: Playwright snapshots are stored per-browser by default (`*-chromium-linux.png` etc. under `tests/*-snapshots/`) — check `ls tests | grep -i snapshots | head` and one snapshot dir to see the naming convention actually in use. Firefox/webkit will need NEW baselines generated (`--update-snapshots`), which is the bulk of this plan's effort and must be done on the SAME runner class that CI uses (self-hosted `nashua`), or baselines won't match.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install browsers | `pnpm exec playwright install firefox webkit` | exit 0 |
| Run one spec x-browser | `npx playwright test volumeBasic --project=firefox` | pass or produce triage-able diffs |
| Generate baselines | `./scripts/run-playright.sh --project=firefox --update-snapshots` (confirm flag pass-through in the script first) | snapshots written |
| YAML validity | `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/playwright-crossbrowser.yml'))"` | no errors |

## Scope

**In scope**:
- `.github/workflows/playwright-crossbrowser.yml` (create — a separate workflow, NOT an edit of the PR-blocking `playwright.yml`)
- New per-browser snapshot baseline files under `tests/**-snapshots/` (generated, firefox/webkit only)
- Possibly small allowances in `playwright.config.ts` (e.g. per-project `maxDiffPixelRatio`) — only if a handful of specs have minor antialiasing diffs; any threshold change must be per-project, never loosening chromium.

**Out of scope** (do NOT touch):
- `playwright.yml` (the PR gate stays chromium-only and blocking).
- karma browser matrix (Firefox karma lane is a separate, lower-value change).
- Test spec logic — if a spec fundamentally can't run on a browser, mark it with Playwright's per-project `skip` annotation rather than editing its assertions; keep a list.
- WebGL workarounds in library source code — cross-browser FAILURES found by the new lane are findings to report, not to fix in this plan.

## Git workflow

- Branch: `advisor/013-ci-cross-browser-lane`
- Commit style: `ci: add scheduled firefox/webkit playwright lane` (workflow) + `test: add firefox/webkit screenshot baselines` (snapshots)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Local (or runner-side) feasibility probe

Install firefox+webkit browsers and run a small representative set on firefox:
`npx playwright test stackBasic volumeBasic --project=firefox` (pick 2–3 specs
that exist — `ls tests/*.spec.ts | head`). Triage outcomes:
- Pass → proceed.
- Screenshot-mismatch only → baselines needed, proceed.
- Hard failures (context creation, timeouts) → record which specs; they get
  per-project skips with a tracking list in the workflow file header comment.

WebKit on Linux may need system deps (`pnpm exec playwright install-deps webkit`) — on the self-hosted runner this may require operator action; if so, scope the new lane to firefox only and note webkit as blocked.

**Verify**: a written pass/diff/fail triage table for the probe set.

### Step 2: Create the scheduled workflow

`.github/workflows/playwright-crossbrowser.yml`, modeled on `playwright.yml`'s
steps (same checkout/pnpm/node action versions, nashua lock wrapper, artifact
upload), with these differences:

```yaml
on:
  schedule:
    - cron: '0 6 * * 1-5'   # weekday nightly; adjust to team preference
  workflow_dispatch:
```

- Matrix: `browser: [firefox, webkit]` (or firefox-only per Step 1), single
  mode (`legacy`, no `--compat/--next`), `run_args: '--project=${{ matrix.browser }}'`.
- Browser install: `pnpm exec playwright install ${{ matrix.browser }}` (plus `install-deps` if Step 1 needed it).
- `continue-on-error: true` at the job level initially (non-blocking by design), and always-upload the report artifact.

**Verify**: YAML-parse → no errors.

### Step 3: Generate baselines for the passing spec set

Run the suite per browser with `--update-snapshots` (via
`scripts/run-playright.sh` if it forwards the flag; otherwise
`npx playwright test --project=firefox --update-snapshots`), commit the new
`*-firefox-linux.png` / `*-webkit-linux.png` files. Specs from Step 1's
hard-failure list get per-project skips instead.

IMPORTANT: baselines must be generated on the same platform CI runs on. If
your environment is not the `nashua` runner class (linux), generate what you
can, mark the lane `continue-on-error`, and state in the report that first CI
runs will need `--update-snapshots` from the runner (the
`test:e2e:update`-style flow).

**Verify**: `npx playwright test --project=firefox` (no update flag) → green for the non-skipped set, locally or on the runner.

## Test plan

The plan IS test infrastructure. Success = the scheduled workflow exists,
parses, and a firefox run is reproducibly green (or has a documented skip
list) wherever baselines were generated.

## Done criteria

- [ ] `.github/workflows/playwright-crossbrowser.yml` exists, YAML-valid, scheduled + manually dispatchable, non-blocking
- [ ] Firefox (± webkit) baselines committed for the passing set; skip list documented in the workflow header comment
- [ ] `npx playwright test --project=firefox` green on the baseline-generation machine
- [ ] `git status` clean outside in-scope paths
- [ ] `plans/README.md` status row updated (including the skip list and any webkit blockage)

## STOP conditions

Stop and report back (do not improvise) if:

- `scripts/run-playright.sh` hardcodes chromium assumptions that `--project` can't override.
- More than ~30% of probed specs hard-fail on firefox — the lane needs library-side work first; deliver the failure list as findings.
- Baseline generation requires the self-hosted runner and you have no access — deliver the workflow + skip-list scaffolding and mark the plan BLOCKED (runner access) in `plans/README.md`.
- Snapshot naming in this repo turns out NOT to be per-browser (custom `snapshotPathTemplate` without browser tokens) — adding browsers would clobber chromium baselines; report before generating anything.

## Maintenance notes

- Reviewer: verify chromium baselines and thresholds are untouched (`git diff --stat` should show only new files + the workflow).
- Graduation path (deferred): once the lane is stably green for ~2 weeks, drop `continue-on-error` and consider adding it to PRs for a critical-spec subset.
- Karma Firefox lane and vitest-browser multi-engine runs were considered and deferred — the Playwright screenshot suite is where cross-browser rendering regressions actually surface.
