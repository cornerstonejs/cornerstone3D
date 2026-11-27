---
id: volume-slice-navigation-implementation
title: Volume slice navigation implementation
summary: How the planar and legacy volume viewports place the slices of a volume
---

# Volume slice navigation implementation

## Scope

This specification gives the implementation requirements for the slice
positions of a volume. Each requirement cites the user requirement of the
[volume slice navigation requirements](./requirements.md) that it satisfies.

Change rule: change a requirement of this document freely when a better
approach appears, on the condition that the cited user requirements still
hold.

## Terms

- `n` — the unit view-plane normal.
- `min`, `max` — the minimum and the maximum of `n · c` over the voxel centres
  `c` at the corners of the volume. `range = max - min`.
- `s` — the slice step.
- `M` — the index of the last slice.

## Requirements

- **VSN-I-1** (VSN-U-1, VSN-U-2) The step `s` is the L1 thickness of one voxel
  along `n`: `s = Σᵢ |n · aᵢ| · spacingᵢ`, where `aᵢ` are the voxel axes
  (`getVoxelThicknessAlongNormal`). The default of
  `rendering.sliceStepMeasure` is `'l1'`. A voxel is a box with the width `s`
  along `n`, so planes at the distance `s` cut each voxel exactly once.
- **VSN-I-2** (VSN-U-1, VSN-U-3, VSN-U-5) The grid is centred on the volume.
  The slice `k` is at the depth `start + k·s`, for `k = 0..M`, with
  `M = round(range / s)` and `start = min + (range - M·s) / 2`. Slice 0 is
  `|range - M·s| / 2 ≤ s / 4` from `min`, and slice `M` is the same distance
  from `max`. That distance is less than `s / 2`, so slice 0 and slice `M` cut
  the voxels at the two opposite corners.
- **VSN-I-3** (VSN-U-1) A clamp of a slice depth uses `[start, start + M·s]`,
  not `[min, max]`. A clamp to `min` or to `max` moves an end slice off the
  grid, and then two slices cut some voxels.
- **VSN-I-4** (VSN-U-1, VSN-U-5) The planar viewport and the legacy volume
  viewport use the same grid and the same index:
  `k = round((depth - start) / s)`, clamped to `[0, M]`. This applies to the
  scroll, to the snap of the focal point, to the slice index that a viewport
  reports, and to the initial slice. The initial slice is
  `k = floor((M + 1) / 2)`, counted in view order from `min`. When `M` is even,
  that slice passes through the centre of the volume. When `M` is odd, it is
  `s / 2` past the centre. The legacy reset of the camera goes to the same
  slice. For an even number of acquired images and a normal against the voxel
  axis, the reset slice is one slice away from the reset slice of earlier
  versions.
- **VSN-I-5** (VSN-U-4) When `n` is parallel to a voxel axis, the L1 thickness
  equals the L2 spacing and `range / s` is an integer. Then `start = min`, and
  the grid is the acquired images.
- **VSN-I-6** (VSN-U-1, VSN-U-5) One shared helper, `getVolumeSliceGrid` in
  `packages/core/src/utilities`, gives `start`, `M` and the index for both
  viewports. `getSliceStep` in the same file reads
  `rendering.sliceStepMeasure`. No viewport computes the grid on its own.

## Limits

- A plane can cut a voxel in a small corner only. In that case the cut can be
  smaller than one screen pixel, and the rendered slice can fail to show the
  voxel at a low zoom. VSN-U-1 is a statement about the depth of the slices,
  not about the screen sampling.
- With `rendering.sliceStepMeasure: 'l2'`, the grid stays centred, but the
  step is shorter than one voxel for an oblique normal. Then VSN-U-1 and
  VSN-U-2 do not hold.
- `round` at exactly `range / s = j + 0.5` is a tie. Either result keeps the
  end slices `s / 4` inside the corner voxels, so the tie does not matter.
