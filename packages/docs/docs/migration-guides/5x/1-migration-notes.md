# 5.x Migration Reference Notes

This page tracks smaller migration-impacting behavior changes that are useful
as reference during 4.x -> 5.x upgrades.

## `disableScale` and `imageFrame.preScale`

## What Changed

In 5.x, when `disableScale` is `true`, Cornerstone3D no longer sets
`imageFrame.preScale` and preserves the original pixel min/max range
(`minAfterScale = minBeforeScale`, `maxAfterScale = maxBeforeScale`).

This is intentional for cases where scaling is identity
(for example slope/intercept being 1/0).

## Why This Matters

In 4.x, some workflows implicitly relied on `imageFrame.preScale` always being
present. In 5.x, that object may be `undefined` when scaling is disabled.

## Migration Guidance

- Treat `imageFrame.preScale` as optional and guard access accordingly.
- If your downstream logic requires a pre-scale descriptor, create one in your
  application code when `disableScale` is enabled.
- If you only need pixel statistics, use `minPixelValue`/`maxPixelValue` from
  the image frame values directly instead of assuming post-scale values.

## `instance` data object model in metadata modules

### What Changed

In 5.x, this is primarily a documentation clarification rather than a new
runtime behavior change: `instance` data should be understood as a single
per-frame object that includes computed per-frame values merged into one object.

This object can use inheritance to compose values from multiple metadata levels.
Because of that, consumers should not assume all attributes are directly
iterable/enumerable on the object itself.

### 4.x vs 5.x interpretation

- **4.x:** this shape/behavior existed in practice, but was not clearly documented.
- **5.x:** the same model is now explicitly documented so integrations can rely
  on the intended contract.

### Migration Guidance

- Do not rely on object enumeration (`Object.keys`, `for...in`) to discover all
  available attributes on instance data.
- Access known attributes explicitly, or use module utilities that understand the
  composed/inherited object structure.
- When building instance data from naturalized metadata, prefer the
  `combineFramesInstance` utility so downstream modules receive the expected
  base object shape.

## In-plane voxel iteration and oblique in-plane spacing

### What Changed

5.x adds two core utilities for enumerating voxels on an annotation plane rather
than over the full 3D bounding box:

- `csUtils.getInPlaneSpacingAndXYDirections(imageData, viewRight, viewUp)` —
  returns the in-plane voxel spacing (`[xSpacing, ySpacing]`) and the world-space
  x/y directions for a plane. It keeps an exact fast path when an in-plane axis is
  parallel to a volume axis, and projects the volume spacing onto the axis
  otherwise.
- `csUtils.iterateOverPlane(volume, options)` — walks the voxels on an oriented
  plane (or thin slab, via `normalExtent`) at voxel spacing, de-duplicating
  visited voxels. This is `O(N²)` in the in-plane area instead of `O(N³)` over the
  axis-aligned box, which matters for oblique planar fills.

The planar freehand spacing helper
(`getSubPixelSpacingAndXYDirections`) was refactored to delegate its geometry to
the shared core utility. As part of that, the shared in-plane spacing path **no
longer throws `'No support yet for oblique plane planar contours'`** — oblique
planes now resolve to a projected voxel spacing.

### Why This Matters

- Oblique planar fills no longer pay the cost of testing the mostly-empty 3D
  bounding box, and the off-plane depth-tolerance fudge is no longer needed.
- Code that previously caught/relied on the oblique throw from the shared spacing
  path will no longer see that exception.

### Migration Guidance

- These are additive core utilities; no action is required to keep existing
  behavior.
- If you implemented a custom planar fill strategy, you can opt into
  `iterateOverPlane` by providing the plane descriptor on `operationData`;
  `regionFill` falls back to the classic 3D-box iterator when it is absent.
- If you depended on the oblique `throw` as a guard, gate on your own orientation
  check instead.
- See the
  [Planar Fill Iteration](../../concepts/cornerstone-tools/segmentation/planar-fill-iteration.md)
  concept page for the full design and the per-strategy contract.
