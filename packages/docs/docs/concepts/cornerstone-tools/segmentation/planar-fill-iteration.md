---
id: planar-fill-iteration
title: Planar Fill Iteration
summary: How planar segmentation fills (circle / rectangle brushes) enumerate voxels by walking the annotation plane instead of the full 3D bounding box, and the shared in-plane spacing geometry behind it
---

# Planar Fill Iteration

This page documents the underlying mechanics used to decide **which voxels a
planar brush fill touches**, and the two core utilities that make planar fills
correct and cheap on rotated / oblique viewports:

- `csUtils.getInPlaneSpacingAndXYDirections` — the in-plane voxel spacing geometry
- `csUtils.iterateOverPlane` — the in-plane voxel iterator

It is aimed at contributors who need to understand the behavior before relying
on it (e.g. when wiring a new fill strategy, or reasoning about performance).

## Background: the fill contract

A brush fill strategy's `Initialize` step produces two things on
`operationData`:

- **`isInObjectBoundsIJK`** — an IJK bounding box `[[iMin, iMax], [jMin, jMax], [kMin, kMax]]` that limits which voxels are visited.
- **`isInObject(pointLPS, pointIJK)`** — a predicate deciding whether a visited voxel is inside the shape.

The `Fill` step (`regionFill`) hands both to the voxel manager, which walks the
voxels in the bounds and calls the predicate. The classic iterator is a
triple-nested loop over the **axis-aligned IJK box**:

```ts
for (let k = kMin; k <= kMax; k++) {
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const pointLPS = indexToWorld([i, j, k]);
      if (pointInShapeFn(pointLPS, [i, j, k])) {
        // fill
      }
    }
  }
}
```

### Why this is wasteful for oblique planes

For a planar shape (circle or rectangle) the filled region is a thin 2D sheet.
When that sheet is **axis-aligned**, its IJK bounding box is one voxel thick, so
the loop is already tight. When the sheet is **oblique**, the axis-aligned box
that encloses it is large in _all three_ axes while only an `O(N²)` sheet is
actually inside — so the loop tests `O(N³)` voxels to fill `O(N²)`. The cost grows
with the obliquity, and the predicate has to add a depth-tolerance term to reject
the off-plane voxels it should never have visited.

Planar fill iteration removes that waste by enumerating the plane directly.

## `getInPlaneSpacingAndXYDirections`

```ts
const { spacing, xDir, yDir } = csUtils.getInPlaneSpacingAndXYDirections(
  { direction, spacing }, // the volume's direction matrix and voxel spacing
  viewRight, // in-plane x axis (world space, normalized)
  viewUp // in-plane y axis (world space, normalized)
);
// spacing: [xSpacing, ySpacing]  — world mm per voxel along viewRight / viewUp
// xDir, yDir: the world-space directions of those axes
```

This answers "how far, in world mm, is one voxel along this in-plane direction?"
for each of the two in-plane axes. It has two paths:

- **Orthogonal (fast path):** if an in-plane axis is (anti)parallel to a volume
  axis, that axis's exact `spacing[a]` and direction are returned.
- **Oblique:** otherwise the volume spacing is projected onto the (arbitrary)
  in-plane direction — the same measure `getSpacingInNormalDirection` uses for the
  normal — and the in-plane axis itself is returned as the direction.

This is the **same geometry** used by the planar freehand area calculation
(`getSubPixelSpacingAndXYDirections`), which now delegates to this shared core
utility. The previous behavior of throwing on oblique planes has been replaced by
the projected-spacing path, so oblique planes are supported.

## `iterateOverPlane`

```ts
const points = csUtils.iterateOverPlane(
  { dimensions, origin, direction, spacing }, // volume geometry
  {
    center, // world focal point of the plane
    viewRight,
    viewUp, // in-plane axes (world space; normalized internally)
    uExtent,
    vExtent, // half-extents along viewRight / viewUp, in world mm
    normalExtent, // half-extent along the plane normal (default 0)
    subPixelResolution, // oversampling factor (default 1)
    pointInShapeFn, // optional (u, v, w) => boolean shape test in plane coords
    callback, // optional per-voxel callback
  }
);
// points: de-duplicated { pointIJK, pointLPS, index } visited in iteration order
```

### Algorithm

1. **Build the plane basis.** Normalize `viewRight` and `viewUp`; the plane
   normal is `viewRight × viewUp`.
2. **Derive the step size from voxel spacing.** The in-plane step is
   `getInPlaneSpacingAndXYDirections(...)` divided by `subPixelResolution`; the
   normal step (only used when `normalExtent > 0`) comes from
   `getSpacingInNormalDirection`. Stepping at the voxel spacing means consecutive
   samples land on adjacent voxels rather than over- or under-sampling.
3. **Walk plane coordinates.** Loop `u ∈ [-uExtent, uExtent]`,
   `v ∈ [-vExtent, vExtent]`, and (if `normalExtent > 0`)
   `w ∈ [-normalExtent, normalExtent]`. For each sample, the world point is
   `center + u·viewRight + v·viewUp + w·normal`.
4. **Map to a voxel.** Convert the world point to a fractional index and round.
   Samples outside `dimensions` are skipped.
5. **De-duplicate.** Sub-voxel sampling can map several samples to the same
   voxel, so each voxel index is emitted exactly once (tracked in a `Set`). This
   matters because counting consumers (statistics, thresholding) must not
   double-count.
6. **Test and emit.** If `pointInShapeFn(u, v, w)` passes (default: always), the
   voxel is recorded and `callback` is invoked.

Cost is proportional to the in-plane area (`O(N²)`), independent of the viewport
orientation.

### Single plane vs. slab (`normalExtent`)

`normalExtent` is the half-thickness of the iterated slab along the plane normal:

- **`normalExtent = 0`** (default): a single zero-thickness plane. This is the
  circle / rectangle case — exactly one plane is cut through the volume.
- **`normalExtent > 0`**: the stack of parallel planes within the slab is swept.
  This is the hook for **collapsing volumetric shapes (sphere, 3D ellipse) onto
  the same iterator** — the oriented bounding box is iterated plane-by-plane, with
  the per-plane in-plane limits coming from the shape's `pointInShapeFn`.

### Worked example

An oblique plane through the center of an `11³` volume (isotropic spacing,
identity direction), with `viewRight = [1,0,0]` and `viewUp = [0, √½, √½]`,
defines the surface `z = y`. With `normalExtent = 0`:

- exactly **121 voxels** are produced — the full `11 × 11` cross-section — versus
  the `11³ = 1331` voxels a 3D box would visit;
- it is a **single-valued surface**: one voxel per `(i, j)` (never a stacked slab);
- every voxel center sits on the plane with **zero perpendicular drift**;
- it spans the **whole volume** in both in-plane directions.

## Assumptions and constraints

- **Orthonormal direction matrix.** The world↔index mapping assumes the volume's
  direction vectors are orthonormal (the standard cornerstone assumption). Sheared
  grids are not supported.
- **De-duplication is required for correctness of counts.** Plain label fills are
  idempotent, but statistics/threshold compositions count voxels, so the iterator
  emits each voxel once.
- **In-plane predicate.** When a fill strategy adopts this iterator, its shape
  test is expressed in plane coordinates `(u, v)` (e.g. `(u/rx)² + (v/ry)² ≤ 1`
  for a circle), which removes the off-plane depth-tolerance term the 3D-box
  predicate needed.

## Using it from a fill strategy

Planar fill iteration is opt-in and backward compatible. A strategy's
`Initialize` step provides the plane descriptor alongside the existing IJK bounds;
`regionFill` uses the plane iterator when the descriptor is present and otherwise
falls back to the classic 3D-box iterator. Volumetric strategies that genuinely
need the full box (or that set `normalExtent > 0`) are unaffected.

:::note
At the time of writing, `getInPlaneSpacingAndXYDirections` and `iterateOverPlane`
are available as core utilities and are covered by unit tests. Switching the
circle and rectangle brush strategies over to the plane iterator is the planned
follow-up; this page documents the contract those strategies will use.
:::
