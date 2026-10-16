# Plan 002: Fix `getVolumeContainingImageId` aborting its search on the first empty/unloaded volume

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/core/src/cache/cache.ts`
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

`cache.getVolumeContainingImageId(imageId)` answers "which cached volume owns
this image?" — used by tools and segmentation code to resolve an image back to
its volume. The lookup loop uses `return` where it means `continue`: the first
volume that is missing or has zero `imageIds` ends the whole search, so a
matching volume iterated later is never found. It also destructures `volume`
from the cached entry without a guard — a volume that is cached but not yet
loaded (`volume === undefined`) makes the function throw `TypeError` instead of
skipping. Both failure modes only appear with 2+ volumes in the cache, which is
exactly the MPR/fusion scenario.

## Current state

- `packages/core/src/cache/cache.ts` — the singleton cache class; `getVolumeContainingImageId` at ~lines 615–642.

The broken loop (`packages/core/src/cache/cache.ts:622-641`):

```ts
    for (const volumeId of volumeIds) {
      const cachedVolume = this._volumeCache.get(volumeId);

      if (!cachedVolume) {
        return;
      }

      const { volume } = cachedVolume;

      if (!volume.imageIds.length) {
        return;
      }

      const imageIdIndex = volume.getImageURIIndex(imageIdToUse);

      if (imageIdIndex > -1) {
        return { volume, imageIdIndex };
      }
    }
```

Repo conventions: TypeScript, prettier-formatted. Jest unit tests live in
`packages/core/test/*.jest.js` (karma tests are `*_test.js` — don't add karma).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Typecheck/build core | `pnpm --filter @cornerstonejs/core run build:esm` | exit 0 |
| Unit test (this fix) | `pnpm run test:unit:no-coverage -- getVolumeContainingImageId` | new tests pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/cache/cache.ts` (only the `getVolumeContainingImageId` method)
- `packages/core/test/cache_getVolumeContainingImageId.jest.js` (create)

**Out of scope** (do NOT touch, even though they look related):
- Any other method of `cache.ts` (eviction, purge, size accounting — plan 007 covers geometry sizing separately).
- `getImageURIIndex` / `imageIdToURI` implementations.

## Git workflow

- Branch: `advisor/002-fix-get-volume-containing-image-id`
- Commit message style: conventional commits, e.g. `fix(core): continue past empty or unloaded volumes in getVolumeContainingImageId`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the early returns with skips and guard the unloaded case

Target shape:

```ts
    for (const volumeId of volumeIds) {
      const cachedVolume = this._volumeCache.get(volumeId);

      if (!cachedVolume) {
        continue;
      }

      const { volume } = cachedVolume;

      if (!volume?.imageIds?.length) {
        continue;
      }

      const imageIdIndex = volume.getImageURIIndex(imageIdToUse);

      if (imageIdIndex > -1) {
        return { volume, imageIdIndex };
      }
    }
```

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm` → exit 0.

### Step 2: Add regression tests

Create `packages/core/test/cache_getVolumeContainingImageId.jest.js`. Import
`cache` from `packages/core/src/cache/cache` (or via the package index — match
the import style of an existing jest test in `packages/core/test/`). You can
seed `_volumeCache` through the public API (`cache.putVolumeLoadObject`) or,
if that requires too much volume scaffolding, construct minimal fake volume
objects with `imageIds` and a `getImageURIIndex(uri)` method and insert them
via `putVolumeLoadObject(volumeId, { promise: Promise.resolve(fake) })`
followed by awaiting the promise — read how `putVolumeLoadObject` stores
`volume` on the cached entry in `cache.ts` before choosing the seeding approach.

Cases:
1. Two volumes cached; the FIRST has `imageIds: []`, the SECOND contains the
   target imageId → function returns the second volume + index (fails on the
   old code, which returned `undefined`).
2. First cached entry has no `volume` yet (load object whose promise has not
   resolved) → function does not throw and still finds the match in the
   second volume.
3. No volume contains the imageId → returns `undefined`.

Call `cache.purgeCache()` (and purge volumes) in `afterEach` so state doesn't
leak between tests — `cache` is a singleton.

**Verify**: `pnpm run test:unit:no-coverage -- getVolumeContainingImageId` → 3 new tests pass.

## Test plan

Covered in Step 2 (regression, unloaded-volume guard, miss path). Pattern
file: any existing `packages/core/test/*.jest.js`.

## Done criteria

- [ ] In `getVolumeContainingImageId`, `grep -A3 'if (!cachedVolume)'` shows `continue`, not `return`
- [ ] `pnpm --filter @cornerstonejs/core run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage -- getVolumeContainingImageId` passes (3 new tests)
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live method no longer matches the excerpt (drift).
- You find call sites that *depend* on the early-return behavior (search
  `getVolumeContainingImageId` usages first: `grep -rn getVolumeContainingImageId packages/*/src`); if any caller's comment/logic assumes "undefined means first volume was empty", report it.
- Seeding the singleton cache in jest proves impossible without touching production code.

## Maintenance notes

- Reviewer: confirm the `volume?.imageIds?.length` guard — an unloaded volume must be skipped, not treated as a match failure for the whole cache.
- Related but separate: geometry cache accounting bugs in the same file are handled by plan 007.
