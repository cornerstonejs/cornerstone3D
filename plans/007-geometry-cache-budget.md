# Plan 007: Count geometry in the cache budget and purge it in `purgeCache()`

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

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes eviction/purge behavior)
- **Depends on**: plans/002-fix-get-volume-containing-image-id.md (same file — land 002 first to avoid conflicts)
- **Category**: bug
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

The cache enforces `maxCacheSize` (tuned to browser memory limits) via
`getCacheSize()` / `getBytesAvailable()`, but `getCacheSize()` returns only
`_imageCacheSize`. Geometry memory (contour sets, surfaces, meshes — which get
large with segmentations) is tracked in `_geometryCacheSize` yet never counted
against the budget, so total memory can exceed `maxCacheSize` and crash the
tab. Additionally, `purgeCache()` — the "free everything" API — purges volumes
and images but never touches `_geometryCache`, silently retaining all geometry.

## Current state

- `packages/core/src/cache/cache.ts` — singleton cache. Key members:
  - `_geometryCache = new Map<string, ICachedGeometry>()` (line 43); `_geometryCacheSize = 0` (line 47)
  - `getCacheSize` (line ~138), `getBytesAvailable` (~144)
  - `purgeCache` (~242), `purgeVolumeCache` (~266)
  - `removeGeometryLoadObject` (~1060–1080), `putGeometryLoadObject` (~933)
  - `incrementGeometryCacheSize` / `decrementGeometryCacheSize` (~1087–1096)

Excerpts (verified at the planned-at commit):

```ts
  // cache.ts:138
  public getCacheSize = (): number => this._imageCacheSize;

  // cache.ts:144-146
  public getBytesAvailable(): number {
    return this.getMaxCacheSize() - this.getCacheSize();
  }

  // cache.ts:242-261 (abridged)
  public purgeCache = (): void => {
    const imageIterator = this._imageCache.keys();
    // need to purge volume cache first to avoid issues with image cache
    // shared cache keys
    this.purgeVolumeCache();
    while (true) {
      const { value: imageId, done } = imageIterator.next();
      if (done) { break; }
      this.removeImageLoadObject(imageId, { force: true });
      triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_REMOVED, { imageId });
    }
  };

  // cache.ts:1087-1096
  public incrementGeometryCacheSize = (increment: number) => {
    this._geometryCacheSize += increment;
  };
  public decrementGeometryCacheSize = (decrement: number) => {
    this._geometryCacheSize -= decrement;
  };
```

Design caution (why this is MED risk): `getCacheSize()` is public API. Some
callers may use it specifically to mean "image bytes" (e.g. eviction math in
`decacheIfNecessaryUntilBytesAvailable`, external apps like OHIF reading cache
stats). Before changing its return, enumerate callers:
`grep -rn "getCacheSize\|getBytesAvailable" packages/*/src | grep -v test`.
The recommended shape below keeps per-category accessors and folds geometry
into the *budget math* rather than redefining `_imageCacheSize`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Build core | `pnpm --filter @cornerstonejs/core run build:esm` | exit 0 |
| Build tools (downstream compile check) | `pnpm --filter @cornerstonejs/tools run build:esm` | exit 0 |
| Unit test (this fix) | `pnpm run test:unit:no-coverage -- cache_geometry` | new tests pass |
| Full unit suite | `pnpm run test:unit:no-coverage` | all pass |
| Karma suite (cache has karma coverage) | `pnpm run test:ci` | all pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/cache/cache.ts`
- `packages/core/test/cache_geometry_budget.jest.js` (create)

**Out of scope** (do NOT touch, even though they look related):
- `packages/core/src/cache/classes/*` (ImageVolume etc.) — geometry size computation at insert time is out of scope; this plan only wires the ALREADY-tracked size into budget/purge.
- Eviction *policy* (LRU ordering, which entries to evict first) — do not make geometry evictable by `decacheIfNecessaryUntilBytesAvailable`; that needs a design decision about whether geometries are safe to auto-evict (they are often derived state that tools hold references to). Budget counting and manual purge only.
- Public API renames.

## Git workflow

- Branch: `advisor/007-geometry-cache-budget`
- Commit message style: `fix(core): include geometry in cache size accounting and purgeCache`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Enumerate callers of `getCacheSize` / `getBytesAvailable`

Run `grep -rn "getCacheSize\|getBytesAvailable" packages/*/src`. Record the
call sites in your report. If any caller demonstrably needs image-only
semantics (e.g. computes image eviction byte targets from it), keep
`getCacheSize` image-only and instead add the geometry term inside
`getBytesAvailable`. Otherwise (the expected case), proceed with Step 2's
combined accessor.

**Verify**: caller list captured in your notes; no code changed yet.

### Step 2: Add geometry to the budget math

Preferred shape (adjust per Step 1's findings):

```ts
  /** Total bytes tracked by the cache (images + geometry). */
  public getCacheSize = (): number =>
    this._imageCacheSize + this._geometryCacheSize;

  /** Bytes used by cached images only. */
  public getImageCacheSize = (): number => this._imageCacheSize;

  /** Bytes used by cached geometries only. */
  public getGeometryCacheSize = (): number => this._geometryCacheSize;
```

`getBytesAvailable()` needs no change if `getCacheSize()` becomes combined.
Also check `isCacheable` (search it in the file) uses `getBytesAvailable` and
therefore picks up the fix automatically.

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm && pnpm --filter @cornerstonejs/tools run build:esm` → both exit 0.

### Step 3: Purge geometry in `purgeCache`

Add geometry purging after the image loop, iterating a snapshot of keys and
going through the existing removal path so size decrements and `decache()`
hooks run:

```ts
    const geometryIds = Array.from(this._geometryCache.keys());
    geometryIds.forEach((geometryId) => {
      this.removeGeometryLoadObject(geometryId);
    });
```

Read `removeGeometryLoadObject` (~line 1060) first: confirm it decrements
`_geometryCacheSize` and calls the load object's `decache`. If it does NOT
decrement the size, add the decrement there (that is part of this bug). If
there is an event like `GEOMETRY_CACHE_GEOMETRY_REMOVED` in
`packages/core/src/enums/Events.ts`, trigger it to mirror the image path; if
no such event exists, do not invent one.

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm` → exit 0.

### Step 4: Regression tests

Create `packages/core/test/cache_geometry_budget.jest.js` (model on an
existing `packages/core/test/*.jest.js`). Seed geometry via the public API:
`cache.putGeometryLoadObject(geometryId, { promise })` with a minimal fake
geometry, then `cache.incrementGeometryCacheSize(nBytes)` (this mirrors how
production code accounts geometry — confirm by grepping
`incrementGeometryCacheSize` callers in `packages/*/src`).

Cases:
1. After incrementing geometry size by N: `getCacheSize()` includes N and
   `getBytesAvailable()` shrinks by N.
2. `purgeCache()` empties the geometry cache (`cache.getGeometry(geometryId)`
   → undefined) and geometry size returns to 0.
3. Image-only accounting unchanged: putting an image load object still
   reflects in `getImageCacheSize()`.

Reset the singleton in `afterEach` (`cache.purgeCache()` and restore
`setMaxCacheSize` if you changed it).

**Verify**: `pnpm run test:unit:no-coverage -- cache_geometry` → 3 new tests pass; then run the full `pnpm run test:unit:no-coverage` and `pnpm run test:ci` (karma has cache specs) → all pass.

## Test plan

Covered in Step 4. Pattern: existing core jest tests. The karma run in the
commands table is required because `cache` has browser-test coverage that
exercises eviction paths the jest suite doesn't.

## Done criteria

- [ ] `getCacheSize()` (or `getBytesAvailable()`, per Step 1 decision) includes `_geometryCacheSize`
- [ ] `purgeCache` iterates `_geometryCache` via `removeGeometryLoadObject`
- [ ] `pnpm --filter @cornerstonejs/core run build:esm` and `...tools run build:esm` exit 0
- [ ] `pnpm run test:unit:no-coverage` passes incl. 3 new tests; `pnpm run test:ci` passes
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated (include the Step 1 caller list in the PR/report)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 reveals a caller that would change behavior dangerously with a
  combined `getCacheSize` AND image-only semantics can't be preserved via
  `getImageCacheSize` — report the caller and wait for a decision.
- `removeGeometryLoadObject` has side effects beyond decache/size (e.g.
  releasing vtk objects referenced by live actors) that make purge-on-demand
  unsafe — report instead of purging.
- Karma cache specs fail in a way related to eviction thresholds — the budget
  change may need `maxCacheSize` headroom adjustments in tests; report before
  editing test constants.

## Maintenance notes

- Reviewer: this makes `isCacheable` stricter (geometry now consumes budget) — watch for downstream apps that ran near the cache limit; they may start seeing eviction earlier. That is the correct behavior, but call it out in the changelog.
- Deferred: making geometry evictable by the automatic eviction loop (needs a design decision about live references from segmentation representations); volume scalar-buffer accounting (intentionally shared-key design per existing comments).
