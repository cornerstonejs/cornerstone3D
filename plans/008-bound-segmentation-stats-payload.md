# Plan 008: Bound segmentation-statistics worker payloads to the segment's bounding box

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/tools/src/utilities/segmentation/getStatistics.ts packages/tools/src/utilities/segmentation/computeMetabolicStats.ts packages/tools/src/workers/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (IJK/index math between main thread and worker)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

Computing statistics for a segment currently materializes the ENTIRE
segmentation volume and the ENTIRE reference image volume as flat typed arrays
(`getCompleteScalarDataArray()`) and ships both to the compute worker — even
when the segment occupies a few thousand voxels of a multi-hundred-MB CT/PET
volume. The segment's bounding box (`boundsIJK`) is already computed and
available at the call site but unused for payload bounding. Cost: two
full-volume allocations + copies + a structured-clone/transfer per stats call,
plus a full-volume scan in the worker. Bounding the payload makes stats cost
scale with segment size instead of volume size.

## Current state

- `packages/tools/src/utilities/segmentation/getStatistics.ts` — main entry; volume path builds `segmentationInfo`/`imageInfo` around lines 110–175.
- `packages/tools/src/utilities/segmentation/computeMetabolicStats.ts` — same full-volume pattern at lines ~71 and ~88.
- The worker task: `getWebWorkerManager().executeTask('compute', 'calculateSegmentsStatisticsVolume', { segmentationInfo, imageInfo, indices, unit, mode })` (`getStatistics.ts:142-151`). Find the worker implementation with `grep -rn "calculateSegmentsStatisticsVolume" packages/tools/src` (expected under `packages/tools/src/workers/`).
- `packages/core/src/utilities/VoxelManager.ts` — voxel access layer: `getCompleteScalarDataArray?` (line 58), `getBoundsIJK()` (~line 264), `forEach(callback, { boundsIJK })` (~line 296+) which iterates only within bounds.

Verified excerpt (`getStatistics.ts:114-136`, abridged):

```ts
  const { boundsIJK: boundsOrig } = segmentationVoxelManager;
  if (!boundsOrig) {
    return VolumetricCalculator.getStatistics({ spacing });
  }

  const segmentationScalarData =
    segmentationVoxelManager.getCompleteScalarDataArray();

  const segmentationInfo = {
    scalarData: segmentationScalarData,
    dimensions: segmentationImageData.getDimensions(),
    spacing: segmentationImageData.getSpacing(),
    origin: segmentationImageData.getOrigin(),
    direction: segmentationImageData.getDirection(),
  };

  const imageInfo = {
    scalarData: imageVoxelManager.getCompleteScalarDataArray(),
    dimensions: imageData.getDimensions(),
    ...
  };
```

Design target: extract a sub-volume covering the segment's `boundsIJK`
(optionally padded by 1 voxel), ship `{ scalarData: subArray, dimensions:
subDims, origin: shiftedOrigin, spacing, direction, boundsOrigin: [i0,j0,k0] }`
for both segmentation and image, and have the worker compute over the
sub-volume. Statistics that depend on world coordinates (center of mass, SUV
peak sphere, etc.) must use the SHIFTED origin so world math stays correct —
`shiftedOrigin = origin + direction * (spacing ∘ [i0,j0,k0])` (compute with
`vec3`/matrix helpers already used in the file's neighborhood; check how the
worker converts IJK→world before choosing where to apply the shift).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Build core+tools | `pnpm --filter @cornerstonejs/core run build:esm && pnpm --filter @cornerstonejs/tools run build:esm` | exit 0 |
| Unit tests | `pnpm run test:unit:no-coverage` | all pass |
| Karma suite (segmentation stats have browser specs — check `packages/tools/test` for `*stat*`) | `pnpm run test:ci` | all pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/tools/src/utilities/segmentation/getStatistics.ts`
- `packages/tools/src/utilities/segmentation/computeMetabolicStats.ts`
- The worker file implementing `calculateSegmentsStatisticsVolume` (and `calculateMetabolicStats` if separate) under `packages/tools/src/workers/`
- A new shared helper, e.g. `packages/tools/src/utilities/segmentation/extractBoundedSubVolume.ts` (create)
- New jest test `packages/tools/test/extractBoundedSubVolume.jest.js` (create)

**Out of scope** (do NOT touch, even though they look related):
- `packages/tools/src/utilities/segmentation/utilsForWorker.ts` growcut paths — same smell, but growcut correctness is riskier; leave for a follow-up.
- `VoxelManager` internals in core — consume its public API only.
- The stack (per-image) statistics path in `getStatistics.ts` — this plan is the volume path only.
- Statistics algorithms themselves (`VolumetricCalculator`, `processSegmentationStatistics`).

## Git workflow

- Branch: `advisor/008-bound-segmentation-stats-payload`
- Commit message style: `perf(tools): bound segmentation statistics payloads to segment boundsIJK`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the worker and inventory world-coordinate dependencies

Locate the worker via `grep -rn "calculateSegmentsStatisticsVolume" packages/tools/src`.
Read it end-to-end. List every place it uses `dimensions`, `origin`,
`direction`, or absolute voxel indices. This list drives Step 3. If the worker
computes world coordinates from `origin + ijk * spacing * direction`, the
shifted-origin approach works transparently.

**Verify**: written inventory in your working notes (include in final report).

### Step 2: Implement `extractBoundedSubVolume`

New helper taking `(voxelManager, imageData, boundsIJK, pad = 1)` and
returning `{ scalarData, dimensions, origin, spacing, direction, boundsOrigin }`
where `scalarData` is a newly-allocated typed array (same constructor as the
source: use `scalarData.constructor`) filled by iterating k/j/i within the
clamped, padded bounds. Clamp bounds to `[0, dim-1]`. Prefer row-wise
`TypedArray.prototype.set` on `subarray` slices per (j,k) row for speed over
per-voxel loops when the source is a flat array; fall back to
`voxelManager.forEach` with `boundsIJK` if no flat array is available.

**Verify**: `pnpm --filter @cornerstonejs/tools run build:esm` → exit 0, plus the unit test in Step 5.

### Step 3: Switch `getStatistics.ts` volume path to bounded payloads

Replace the two `getCompleteScalarDataArray()` payloads with helper output for
(a) segmentation using `segmentationVoxelManager.getBoundsIJK()` and (b) the
image using the SAME bounds (both sub-volumes must be index-aligned). Apply the
Step 1 inventory: adjust the worker so all world-coordinate math uses the
passed (shifted) origin — if it already does, no worker change is needed.
Mode note: when `indices` covers multiple segments in `individual` mode, the
bounds must cover ALL requested segments — if `segmentationVoxelManager.getBoundsIJK()`
reflects only overall modified bounds, verify it covers every requested
segment's voxels (it tracks the full modified extent, so it does; state this
check in your report).

**Verify**: `pnpm run test:ci` → segmentation-statistics specs pass (find them: `ls packages/tools/test | grep -i stat`).

### Step 4: Same change in `computeMetabolicStats.ts`

Mirror Step 3 for the metabolic-stats payloads (lines ~71/88) and its worker
task (find via the task name string used in that file).

**Verify**: build + `pnpm run test:ci` again.

### Step 5: Unit-test the helper

`packages/tools/test/extractBoundedSubVolume.jest.js` — pure-math tests, no
DOM: construct a small 4×4×4 Uint8 flat volume with known values, bounds
covering a 2×2×2 corner, assert extracted dimensions, values, and shifted
origin (identity direction and a non-identity spacing case).

**Verify**: `pnpm run test:unit:no-coverage -- extractBoundedSubVolume` → pass.

### Step 6: Numerical equivalence check (the real gate)

Before/after comparison: pick an existing karma/playwright statistics test
(e.g. anything asserting mean/max/volume values). If none asserts numeric
values, write a temporary script comparison: run `getStatistics` on a
synthetic volume twice — once with the helper forced to full-volume bounds,
once with tight bounds — and assert identical outputs (this can live inside
the new jest file if `getStatistics`'s dependencies can be constructed in
jest; otherwise do it in a karma spec alongside existing segmentation specs).

**Verify**: identical statistics (exact equality for counts/min/max; 1e-6
tolerance for means/world coordinates).

## Test plan

Steps 5 and 6. Regression risk is entirely "stats numbers changed" — the
equivalence check is mandatory, not optional.

## Done criteria

- [ ] `grep -n "getCompleteScalarDataArray" packages/tools/src/utilities/segmentation/getStatistics.ts packages/tools/src/utilities/segmentation/computeMetabolicStats.ts` returns no matches in the volume paths (stack path in getStatistics may retain its own access pattern)
- [ ] New helper + jest tests pass; equivalence check passes
- [ ] `pnpm --filter @cornerstonejs/tools run build:esm` exits 0; `pnpm run test:unit:no-coverage` and `pnpm run test:ci` pass
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The worker computes statistics that structurally require full-volume context
  (e.g. anything windowed against the whole image histogram) — list them and stop.
- `segmentationVoxelManager.getBoundsIJK()` turns out NOT to cover all
  segment voxels in some path (e.g. bounds reset after certain operations) —
  the correctness premise fails.
- Equivalence check (Step 6) disagrees after one debugging pass.
- The sub-volume path is measurably SLOWER for near-full-volume segments and
  you'd need a heuristic switch — implement `if subVolumeVoxels > 0.5 * totalVoxels: send full` only if trivial; otherwise report.

## Maintenance notes

- Reviewer: scrutinize the origin shift and the index-alignment of the two sub-volumes; that's where silent wrongness lives. Check `individual` vs `collective` mode both tested.
- Follow-up (deferred): the same full-volume pattern exists in `utilsForWorker.ts:120` (growcut prep) and in `WholeBodySegmentTool` (plan 009 handles the latter).
- Future interaction: if VoxelManager gains a native "extract sub-volume" API, replace the helper with it.
