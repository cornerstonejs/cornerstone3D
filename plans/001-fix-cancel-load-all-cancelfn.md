# Plan 001: Make `cancelLoadAll()` actually cancel in-flight loads (`cancel` → `cancelFn`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/core/src/loaders/imageLoader.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

`cancelLoadAll()` is the public API applications call to abort every queued and
in-flight image/volume load (e.g. when tearing down a study). It calls
`loadObject.cancel()`, but the load-object contract only defines `cancelFn`.
So the moment it finds any in-flight load, it throws `TypeError:
loadObject.cancel is not a function`, which aborts the surrounding loop and
leaves the remaining in-flight requests un-cancelled. Every other call site in
the codebase uses `cancelFn`.

## Current state

- `packages/core/src/loaders/imageLoader.ts` — image loading API; `cancelLoadAll` is near the bottom (~line 650–680).
- `packages/core/src/types/ILoadObject.ts` — the contract: both `IImageLoadObject` and `IVolumeLoadObject` declare `cancelFn?: () => void` and `decache?: () => void`; there is **no** `cancel` property.

The broken code (`packages/core/src/loaders/imageLoader.ts:662-673`):

```ts
      if (imageId) {
        loadObject = cache.getImageLoadObject(imageId);
      } else if (volumeId) {
        loadObject = cache.getVolumeLoadObject(volumeId);
      }
      if (loadObject) {
        loadObject.cancel();
      }
```

The correct pattern, from `cancelLoadImage` in the same file
(`packages/core/src/loaders/imageLoader.ts:622-626`):

```ts
  const imageLoadObject = cache.getImageLoadObject(imageId);

  if (imageLoadObject) {
    imageLoadObject.cancelFn();
```

Note that `cancelFn` is optional on the type; `cache.ts` guards it
(`if (imageLoadObject?.cancelFn) { imageLoadObject.cancelFn(); }` at
`packages/core/src/cache/cache.ts:178-179`). Match the guarded style.

Repo conventions: TypeScript, no semicolonless style, prettier-formatted.
Unit tests are jest files named `*.jest.js` under `packages/core/test/`
(karma tests are `*_test.js` in the same directory — do not add a karma test
here).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Typecheck/build core | `pnpm --filter @cornerstonejs/core run build:esm` | exit 0 |
| Unit tests (all) | `pnpm run test:unit:no-coverage` | all pass |
| Unit test (this file) | `pnpm run test:unit:no-coverage -- cancelLoadAll` | new tests pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/loaders/imageLoader.ts` (the `cancelLoadAll` function only)
- `packages/core/test/imageLoader_cancelLoadAll.jest.js` (create)

**Out of scope** (do NOT touch, even though they look related):
- `packages/core/src/types/ILoadObject.ts` — do not add a `cancel` alias; the contract is correct, the call site is wrong.
- `packages/core/src/cache/cache.ts` — its cancel paths are already correct.
- The `// TODO: Clear retrieval and decoding queues as well` in `cancelLoadAll` — known deferred work, not this plan.

## Git workflow

- Branch: `advisor/001-fix-cancel-load-all`
- Commit message style: conventional commits, e.g. `fix(core): use cancelFn in cancelLoadAll so in-flight loads are cancelled`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the call

In `cancelLoadAll` in `packages/core/src/loaders/imageLoader.ts`, replace:

```ts
      if (loadObject) {
        loadObject.cancel();
      }
```

with:

```ts
      if (loadObject?.cancelFn) {
        loadObject.cancelFn();
      }
```

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm` → exit 0.

### Step 2: Add a regression test

Create `packages/core/test/imageLoader_cancelLoadAll.jest.js`. Model the file
structure (imports, module reset) on an existing jest test such as
`packages/core/test/stackViewport_node_render.jest.js` (read it first for the
import style; you likely only need `imageLoader`, `imageLoadPoolManager`, and
`cache` from `packages/core/src`).

Test cases:
1. Register a fake image loader whose load object exposes a jest.fn `cancelFn`,
   start a load via `imageLoader.loadAndCacheImage(...)` so the load object is
   in the cache, call `cancelLoadAll()`, and assert `cancelFn` was called and
   no exception was thrown.
2. A load object **without** `cancelFn` (property absent): `cancelLoadAll()`
   must not throw.

If wiring a real request through `imageLoadPoolManager` proves too indirect,
it is acceptable to test at the cache level: put a load object via
`cache.putImageLoadObject(imageId, { promise, cancelFn })`, enqueue a request
with `additionalDetails.imageId`, then call `cancelLoadAll()`.

**Verify**: `pnpm run test:unit:no-coverage -- cancelLoadAll` → the new tests pass.

## Test plan

Covered by Step 2: happy path (cancelFn invoked), and the guard path (no
cancelFn present, no throw). The bug itself (old code throwing `TypeError`) is
demonstrated by test 1 failing if the fix is reverted.

## Done criteria

- [ ] `grep -n "loadObject.cancel()" packages/core/src/loaders/imageLoader.ts` returns no matches
- [ ] `pnpm --filter @cornerstonejs/core run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage -- cancelLoadAll` passes with 2 new tests
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `cancelLoadAll` in the live file does not contain `loadObject.cancel();` (drift).
- A `cancel` property actually exists on `IImageLoadObject`/`IVolumeLoadObject` in `packages/core/src/types/ILoadObject.ts` (would mean the contract changed and this plan's premise is wrong).
- The jest test cannot import `packages/core/src` modules at all (project config issue beyond this plan).

## Maintenance notes

- Reviewer should confirm only the one call site changed and the guard style matches `cache.ts:178`.
- Deferred (pre-existing TODO in the same function): also cancelling retrieval/decoding queues, and calling `decache()` on cancelled entries — worth a follow-up finding if cancellation memory usage matters.
