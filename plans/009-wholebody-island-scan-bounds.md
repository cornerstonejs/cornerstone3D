# Plan 009: Stop WholeBodySegmentTool from scanning the full volume on the main thread

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/tools/src/tools/annotation/WholeBodySegmentTool.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/008-bound-segmentation-stats-payload.md (reuses its `extractBoundedSubVolume` mindset/helper if applicable; can proceed independently if 008 is not done)
- **Category**: perf
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

`WholeBodySegmentTool.getRemoveIslandData()` runs inside an interactive
segmentation flow. It materializes BOTH the reference volume and the labelmap
volume as complete flat arrays and then loops over every voxel of the labelmap
— synchronously, on the main thread. For a whole-body CT that is two
multi-hundred-MB allocations plus a full linear scan per gesture, freezing
rendering and input. The grow-cut segmentation this tool just ran was bounded
to a box; the island scan can be bounded the same way.

## Current state

- `packages/tools/src/tools/annotation/WholeBodySegmentTool.ts` — the tool. `getRemoveIslandData()` at lines ~239–280; upstream, `runGrowCutForBoundingBox` is invoked with a `boundingBoxInfo` built from `ijkTopLeft`/`ijkBottomRight` (lines ~215–237).

Verified excerpt (`WholeBodySegmentTool.ts:239-272`, abridged):

```ts
  protected getRemoveIslandData(): RemoveIslandData {
    const {
      segmentation: { segmentIndex, referencedVolumeId, labelmapVolumeId },
    } = this.growCutData;
    const referencedVolume = cache.getVolume(referencedVolumeId);
    const labelmapVolume = cache.getVolume(labelmapVolumeId);
    const referencedVolumeData =
      referencedVolume.voxelManager.getCompleteScalarDataArray();
    const labelmapData =
      labelmapVolume.voxelManager.getCompleteScalarDataArray();
    const { islandPixelRange } = this.configuration.islandRemoval;
    const islandPointIndexes = [];

    // ... comment block ...
    // TODO: improve how it looks for pixels in the islands that need to be segmented
    for (let i = 0, len = labelmapData.length; i < len; i++) {
      if (labelmapData[i] !== segmentIndex) {
        continue;
      }
      const pixelValue = referencedVolumeData[i];
      if (
        pixelValue >= islandPixelRange[0] &&
        pixelValue <= islandPixelRange[1]
      ) {
        islandPointIndexes.push(i);
      }
    }
```

Available API (`packages/core/src/utilities/VoxelManager.ts`):
- `voxelManager.getBoundsIJK()` (~line 264) — modified-voxel bounds.
- `voxelManager.forEach(callback, { boundsIJK })` (~line 296+) — iterates only
  within bounds; the callback receives an object including the flat `index`
  and `value` (read the `forEach` implementation to confirm the exact callback
  signature before coding).
- `voxelManager.getAtIndex(index)` — random access without materializing the
  full array.

Also read what consumes `RemoveIslandData` (`grep -rn "RemoveIslandData\|getRemoveIslandData\|islandPointIndexes" packages/tools/src`) — the returned
`islandPointIndexes` are flat indexes into the FULL volume; the fix must keep
that contract (bounded ITERATION, unchanged index space).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Build tools | `pnpm --filter @cornerstonejs/tools run build:esm` | exit 0 |
| Unit tests | `pnpm run test:unit:no-coverage` | all pass |
| Karma | `pnpm run test:ci` | all pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/tools/src/tools/annotation/WholeBodySegmentTool.ts` (only `getRemoveIslandData`)

**Out of scope** (do NOT touch, even though they look related):
- `growCut.runGrowCutForBoundingBox` and the growcut utilities.
- The island-removal consumer (`removeIslands` logic, wherever `RemoveIslandData` flows) — contract stays identical.
- Moving this to a web worker — bigger refactor; bounding the iteration removes ~all of the cost because the growcut bounding box is small relative to the volume. Worker offload is explicitly deferred.
- `islandPixelRange` semantics / the TODO about smarter island detection.

## Git workflow

- Branch: `advisor/009-wholebody-island-scan-bounds`
- Commit message style: `perf(tools): bound WholeBodySegmentTool island scan to labelmap boundsIJK`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace full-array materialization + full scan with bounded iteration

Target shape (adapt to the actual `forEach` callback signature you confirmed):

```ts
    const labelmapVoxelManager = labelmapVolume.voxelManager;
    const referencedVoxelManager = referencedVolume.voxelManager;
    const islandPointIndexes = [];

    labelmapVoxelManager.forEach(
      ({ value, index }) => {
        if (value !== segmentIndex) {
          return;
        }
        const pixelValue = referencedVoxelManager.getAtIndex(index) as number;
        if (
          pixelValue >= islandPixelRange[0] &&
          pixelValue <= islandPixelRange[1]
        ) {
          islandPointIndexes.push(index);
        }
      },
      { boundsIJK: labelmapVoxelManager.getBoundsIJK() }
    );
```

Delete the two `getCompleteScalarDataArray()` calls. Keep everything else in
the method (including the return shape) unchanged.

Correctness argument to verify while implementing: the loop only *keeps*
indexes where `labelmapData[i] === segmentIndex`; voxels with the segment
value can only exist where the labelmap was written, which is inside
`getBoundsIJK()` (the modified-voxel bounds). If you find that
`getBoundsIJK()` returns full-volume bounds when nothing was tracked, that is
the safe degenerate case (same behavior as today, minus the allocations).

**Verify**: `pnpm --filter @cornerstonejs/tools run build:esm` → exit 0.

### Step 2: Suite + behavioral check

**Verify**: `pnpm run test:unit:no-coverage` and `pnpm run test:ci` → all pass;
`pnpm run lint` → exit 0.

If a Playwright example covers this tool (`grep -ril wholeBody tests/ packages/tools/examples | head`), run that single spec:
`npx playwright test <spec> --project=chromium` and confirm it passes.

## Test plan

No new unit file: the method needs cached volumes and growcut state that only
the browser stack constructs. Rely on the karma/playwright segmentation suites
plus the bounded-iteration correctness argument in Step 1 (restate it in the
PR description). If `packages/tools/test` contains an existing
WholeBodySegment or islandRemoval spec (check `ls packages/tools/test | grep -i -e island -e wholebody`), extend it with a case asserting
`islandPointIndexes` equality between old and new implementations on a small
synthetic volume — only if the scaffolding already exists.

## Done criteria

- [ ] `grep -n "getCompleteScalarDataArray" packages/tools/src/tools/annotation/WholeBodySegmentTool.ts` returns no matches
- [ ] `pnpm --filter @cornerstonejs/tools run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage` and `pnpm run test:ci` pass
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `voxelManager.forEach`'s callback does not provide a flat `index` compatible
  with the full-volume index space the consumer expects.
- The labelmap volume's voxel manager type in this path lacks
  `getBoundsIJK`/`forEach` (e.g. it's a plain flat-array manager without bounds
  tracking) — report what type it actually is.
- Any segmentation karma/playwright spec fails after the change.

## Maintenance notes

- Reviewer: the contract is "same `islandPointIndexes`, same order not guaranteed" — check the consumer doesn't depend on ascending order (the bounded k/j/i iteration is still ascending in flat index if `forEach` iterates k-major; confirm and note it).
- Deferred explicitly: worker offload of the island scan, and the pre-existing TODO about smarter island detection.
