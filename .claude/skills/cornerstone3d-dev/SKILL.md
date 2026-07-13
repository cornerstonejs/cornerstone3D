---
name: cornerstone3d-dev
description: Build, typecheck, test, lint, and run examples in the cornerstone3D pnpm monorepo and its git worktrees. Use for any cornerstone3D development task, especially in a fresh worktree, when typecheck fails with cannot-find-module errors for workspace packages, when choosing between jest, karma, vitest browser mode, and Playwright layers, when running an example app, or when preparing a commit or PR in this repo.
---

# cornerstone3D development loop

## Fresh worktree bootstrap

A fresh worktree has no node_modules. Nothing (tsc, jest, oxlint) works before:

```bash
pnpm install --frozen-lockfile
```

Ask before running a long install in a worktree the user just pointed you at — they may have a reason it is not installed.

## Typecheck (the #1 trap)

Packages typecheck against their workspace siblings' **built dist**, not src. Bare `npx tsc --noEmit` in a package fails with `Cannot find module '@cornerstonejs/metadata'` (or `.../core`) until siblings are built, in dependency order:

```bash
pnpm --filter @cornerstonejs/utils --filter @cornerstonejs/metadata run build:esm
pnpm --filter @cornerstonejs/core run build:esm       # before typechecking tools
cd packages/core && npx tsc --noEmit -p tsconfig.json
```

- After editing core, refresh its types before typechecking tools: `cd packages/core && npx tsc -p tsconfig.json --emitDeclarationOnly`.
- A **stale core dist** masks missing exports — if tools "compiles" against an export you just removed (or fails on one you just added), rebuild core first.
- Keep `packages/*/dist/` out of commits.
- If `npx tsc` exits 127, call the binary directly: `./node_modules/.bin/tsc --noEmit -p packages/tools/tsconfig.json`.
- Full build when in doubt: root `pnpm run build:esm` (handles dependency order). Do not pipe build output through `tail` — a "Failed" package can scroll past while dist files still exist; check the exit code.

## Test layers — do not mix them up

| Layer | Files | Run |
|---|---|---|
| jest (jsdom) | `packages/<pkg>/test/*.jest.js` and `src/**/*.spec.ts` | `cd packages/<pkg> && npx jest --config jest.config.js`, or root `npx jest --testPathPatterns '\.jest\.js$'` (flag is plural; singular errors) |
| karma (real browser/WebGL) | `*_test.js` / `*_test.ts` | CI/karma only — `utils/test/testUtils.js` is karma-only, unusable from jest |
| vitest browser mode | `vitest.browser.config.ts`, `**/vitest-browser/**` | `pnpm test:vitest:browser` (serial, `fileParallelism: false`) |
| Playwright e2e | `tests/` | see below |

- jest env is jsdom via root `utils/fixJSDOMJest.js` (polyfills structuredClone/TextEncoder; no fetch). jest-canvas-mock provides **no WebGL context** — capability probes return webgl=false under jest.
- If EVERY jest suite dies in babel setup with `TypeError: [BABEL]: _lruCache is not a constructor`, the hoisted layout (`nodeLinker: hoisted`) lost a nested private dep: `node_modules/@babel/helper-define-polyfill-provider/node_modules/@babel/helper-compilation-targets/node_modules` is empty, so it resolves the hoisted root `lru-cache@11` instead of its declared `^5`. `pnpm install --frozen-lockfile` (even `--force`) no-ops "Already up to date" and does NOT repair it. Fix without nuking node_modules (which kills running dev servers): copy `lru-cache`, `semver`, `yallist` from the healthy top-level `node_modules/@babel/helper-compilation-targets/node_modules/` into the empty nested dir.
- `moduleNameMapper` `^@cornerstonejs/(.*)$` mapped to `../$1/src` is correct despite the literal `$1` inside `path.resolve` — a known bot false positive.
- Package tsc builds compile colocated `*.spec.ts` unless tsconfig `exclude`s them (tools does; copy that pattern into any package where you add specs, or CI's build job breaks).
- Playwright: reliable path is build-examples-first: `NODE_OPTIONS=--max_old_space_size=32896 node ./utils/ExampleRunner/build-all-examples-cli.js --build --fromRoot --packages core` then `PLAYWRIGHT_SKIP_REBUILD=true PLAYWRIGHT_VIDEO=off npx playwright test <spec> --project=chromium`. E2E suite script is `scripts/run-playright.sh` (misspelling is real). Chromium runs with `--use-gl=egl`. Visual-snapshot specs are known-flaky — confirm the same failure exists on main before blaming a PR, then rerun.

## Lint / commit

- Linter is **oxlint** (`npx oxlint <paths> --quiet`); eslint is not installed. `.oxlintrc.json` enforces `typescript/no-explicit-any`; oxlint only covers `src` (examples out of scope — "0 files" is not a pass signal for example edits). Unused catch params flagged — use bare `catch {`.
- Husky pre-commit runs oxlint + prettier `--write` via lint-staged — diff the committed result to confirm prettier did not alter logic.
- macOS has no `timeout` command (exit 127).

## Examples

- Examples auto-discover from `packages/<pkg>/examples/<name>/index.ts` — no registration needed to run; `utils/ExampleRunner/example-info.json` only categorizes for docs.
- Run one: `pnpm run example <name>` or `node ./utils/ExampleRunner/example-runner-cli.js <name>` (default port 3000; override `CS3D_PORT=3311 ... --no-browser`). Do not invoke rspack directly against the autogenerated webpack config — module-resolution globs are cwd-relative and produce hundreds of errors.
- Port 3000 usually belongs to the user's own dev server from another worktree. See the `worktree-dev-servers` skill (personal skills dir) before touching ports or claiming a fix is verified.
- Examples are transpile-only, not strict-typechecked; compare new-example errors against an existing example's baseline.
- Examples expose `window.cornerstone` / `window.cornerstoneTools` for live probing — see the `cornerstone-browser-debug` skill.

## PR conventions

- Origin is `cornerstonejs/cornerstone3D` directly (not a fork). `gh pr create --base main`; keep `.github/PULL_REQUEST_TEMPLATE.md` structure; semantic-release conventional-commit PR titles (`feat(rendering): ...`).
- Branch protection: CI green is not enough (`reviewDecision: REVIEW_REQUIRED`); never `gh pr merge --admin` — the user merges.
- Cross-session project memory lives at `~/.claude/projects/-Users-alireza-open-source-clean-cornerstone3D/memory/` (MEMORY.md + topic files) and is shared across all worktrees — read it before starting, persist durable decisions there.

## Evidence

Distilled from Fable session transcripts (`~/.claude/projects/`): `35d238ba-7305-4e85-b648-dd64e8993bd2` (build order, jest flags), `27b731e8-09fe-4097-939a-5d810b66f1e2` (typecheck=build, stale dist), `8b976bbd-dd81-4652-ac1c-f330fe059c71` (piped-build trap, oxlint), `39b2eff4-1aad-4a79-a57b-4eeed2ef03e0` (emitDeclarationOnly, example runner), `213d86f7-f4e5-44ae-814f-b0bed1a9f00b` (test layers, spec excludes, flake triage), `3b47646e-e895-4ca6-b730-2024bf4c0052` (macOS timeout, direct tsc), `81578530-d15c-4274-a3db-870ef04246db` (vitest browser mode, branch protection), `0a7b50d9`, `7660496d`, `6d9baf09`.

## Keep this skill correct

If any instruction here is wrong, stale, or describes something that no longer exists (a command, flag, path, or behavior), fix it in place as part of your current task instead of working around it. For broader learnings, apply the `self-improving-skills` skill to fold them in.
