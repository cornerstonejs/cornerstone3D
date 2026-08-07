---
id: oblique-integer-voxels
title: Integer Oblique Voxel Iteration for Brush Fills
summary: A deterministic integer-lattice voxel iterator that replaces rounded fractional oblique sampling for circular, spherical and rectangular segmentation brush fills on rotated / oblique viewports
---

# Integer Oblique Voxel Iteration for Brush Fills

## What Changed

5.x adds an **integer oblique voxel iterator** used by the circle, sphere and
rectangle segmentation brush fills. It replaces the previous approach of
sampling an oblique plane at fractional world positions and rounding to a voxel
(`ijk = round(I0 + u*U + v*V + w*W)`), which could duplicate or skip voxels
between adjacent oblique planes and leak fills into neighbouring slices.

The new core utility is exposed as a namespace:

```ts
import { utilities as csUtils } from '@cornerstonejs/core';

const {
  createObliqueIntegerBasis,
  forEachObliqueVoxel,
  buildIntegerBasisFromNormal,
  choosePrimitiveIntegerNormal,
  // gcd2, gcd3, extendedGcd, makePrimitive, canonicalizeSign,
  // ijkFromUVW, uvwFromIJK, detColumns, clipIntegerLineToBox,
  // computeUVWRangesFromBounds, intersectRange, isRangeEmpty,
  // ellipsoidUVWFromIndexQuadratic, sphereIndexQuadratic,
  // getWRangeForUVWEllipsoid, getURangeForW, getVRangeForWU,
  // integerNormalAngularSin, obliquePlaneEdgeDrift, ...
} = csUtils.obliqueIntegerIterator;
```

The following types are re-exported from `@cornerstonejs/core` utilities:
`ObliqueIntegerBasis`, `IntRange`, `ObliqueEllipsoidUVW`, `ObliqueVoxelVisit`.

Internally, the brush strategies set an optional `obliqueIntegerFill` descriptor
on the operation data. When present, `regionFill` enumerates voxels with the
integer iterator; when absent, it falls back to the classic axis-aligned IJK
bounding-box walk.

## Why This Matters

- **Geometric consistency on rotated/oblique views** — brush shapes fill the same
  voxels regardless of camera orientation.
- **No slice leakage** — every integer voxel belongs to exactly one integer plane
  and adjacent planes are disjoint, so fills do not bleed into neighbouring
  slices.
- **Deterministic, fast traversal** — the inner loop advances by a precomputed
  integer step (`ijk += B`) with no per-voxel world/index transforms and no
  per-voxel shape test when the clipped range already guarantees inclusion.
- **Unbiased area/volume counting** — because the lattice basis is unimodular,
  counting filled voxels (times the per-voxel in-plane cell area) is an unbiased
  measure of the shape's area, free of an obliquity-dependent bias.

## Migration Guidance

- **No action required for existing behaviour.** The iterator is opt-in per fill
  strategy and axis-aligned segmentation brushes are unchanged.
- **Custom brush strategies** can adopt it by building a descriptor in their
  `Initialize` step:

  ```ts
  import { createSphereObliqueIntegerFill } from '.../strategies/utils/obliqueIntegerFill';

  operationData.obliqueIntegerFill = createSphereObliqueIntegerFill({
    viewUp,
    viewPlaneNormal,
    centerIJK: operationData.centerIJK,
    segmentationImageData,
    radiusWorld,
  });
  ```

  `regionFill` will then iterate via the integer basis. Omit the descriptor to
  keep the previous bounding-box behaviour.

- **Multi-point circle strokes** (drag painting) still use the classic
  bounding-box iterator with the capsule predicate; the integer path is used for
  single-click circle fills, spheres and rectangles.
- **Continuous geometry is unchanged.** The integer iterator governs voxel
  _ownership_ only. Display position, interpolation and the fractional oblique
  spacing helpers (`getInPlaneSpacingAndXYDirections`, `iterateOverPlane`) are
  kept separate and still available.

## Accuracy Guarantees

The integer normal `N` is chosen so that, over the volume's extent, the edge
voxels of a single oblique plane never drift apart (along the true normal) by
more than one diagonal voxel distance. Larger volumes therefore automatically
select a more accurate integer normal. See the
[Oblique Voxels behaviour definition](../../behaviour/obliqueVoxels.md) (under
[Behaviour](../../behaviour/index.md)) for the full mathematics (the unimodular
integer basis), usage details and the test cases that lock this behaviour in.
