---
id: planar-fill-iteration
title: Planar Fill Iteration
summary: How the circle, sphere and rectangle brush fills enumerate voxels with the shared voxel slab iterator instead of the axis-aligned 3D bounding box, and what the view slab thickness controls
---

# Planar Fill Iteration

This page documents which voxels a brush fill touches, and how the fill finds
them. It is aimed at contributors who write a fill strategy, or who need to
reason about the behaviour on a rotated or oblique viewport.

The brush fills use the same iterator, the same shapes and the same membership
rule as the area annotation tools. That rule is normative, and
[Voxel Statistics](../annotation/voxel-statistics.md) defines it. Read that page
first; this page only covers what is specific to a fill.

## Background: the fill contract

The `Initialize` step of a brush strategy puts two things on `operationData`:

- **`isInObjectBoundsIJK`** — an IJK bounding box
  `[[iMin, iMax], [jMin, jMax], [kMin, kMax]]` that limits which voxels the
  fill visits.
- **`isInObject(pointLPS, pointIJK)`** — a predicate that decides whether a
  visited voxel is inside the shape.

The `Fill` step (`regionFill`) hands both to the voxel manager, which walks
every voxel in the box and calls the predicate:

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

### Why the box walk fails on an oblique plane

A circle or a rectangle brush paints a thin sheet. When the sheet is
axis-aligned its IJK box is one voxel thick, so the loop above is already
tight. When the sheet is oblique the axis-aligned box that encloses it is large
along **all three** axes, while only an `O(N²)` sheet lies inside it. The loop
therefore tests `O(N³)` voxels to fill `O(N²)`, and the waste grows with the
obliquity.

The cost is the smaller problem. The predicate must also reject every off-plane
voxel the loop should never have visited, and it does that with a
depth-tolerance term. Too small a tolerance leaves holes in the sheet; too large
a tolerance bleeds the fill into the neighbouring slices. No single value is
right for every orientation, which is what made the oblique brush shapes wrong.

## The shared voxel slab iterator

`strategies/utils/brushVoxelSlab.ts` replaces both halves. It describes the
brush as a `VoxelSlabShape` anchored on the view plane, and enumerates the
voxels of that shape with `csUtils.voxelSlab.iterateVoxelsInShape`.

The iterator emits exact integer runs along one voxel axis, nested inside the
slab's own bounds along the normal, so:

- it visits only voxels the brush covers, plus the rows it touches — never the
  volume of the bounding box;
- it visits each voxel exactly once, which matters because a fill that writes a
  voxel twice records two undo entries for it;
- it needs no depth tolerance, because the slab bound is exact for every
  orientation.

Each brush builds one shape per stroke centre, and `createUnionShape` merges
their runs into a disjoint sequence:

| Brush            | Shape                                  | Depth                        |
| ---------------- | -------------------------------------- | ---------------------------- |
| Circle / ellipse | `createEllipseShape`, flat             | From the view slab thickness |
| Sphere           | `createCircleShape` with `depthRadius` | Its own radius               |
| Rectangle        | `createRectangleShape`, flat           | One voxel along the normal   |

`regionFill` falls back to the box walk when a strategy builds no fill — a
degenerate brush, or a strategy that has not moved onto the iterator yet — so
`isInObject` and `isInObjectBoundsIJK` are still required.

## What the view slab thickness controls

A circle or a rectangle brush is flat: it lies in the view plane and carries no
depth of its own. The reference plane thickness therefore decides how deep the
fill reaches along the normal.

- **Thin (single-slice) view** — the default, and what you get when the
  viewport reports no slab thickness. The thickness is one voxel measured along
  the normal, so the fill paints one oblique layer. Rule M widens the slab by
  half a voxel on each side, and that is what keeps the layer watertight: a
  thinner slab grazes the voxel grid at sparse positions and shows up as spaced
  lines or holes on a steep oblique plane.
- **Full-thickness (thick-slab) view** — the view slab thickness passes through
  as the reference plane thickness, so the flat disc becomes a short cylinder
  and the fill paints every layer through the slab.

A sphere brush is the exception. It carries its own depth, reports that depth
through `getRequiredThickness`, and so ignores the view slab entirely.

### Area semantics for a thick-slab fill

A thin fill is one voxel deep, so its in-plane area is the painted voxel count
times the voxel area. A thick-slab fill is a volume, not a planar region: an
**area** computed over its voxels must divide by the depth in voxels, or the
extra layers over-count the area. This affects area measurements only. A
freeform fill that computes no area is unaffected.

## A stroke

The pointer reports a handful of positions per stroke, and a fast drag leaves
them further apart than the brush is wide. The union of discs at only those
positions would be a dotted line, so `brushVoxelSlab.ts` resamples the stroke at
half the smaller radius, which guarantees that consecutive discs overlap.

The circle brush projects every disc onto the one view plane, so a stroke paints
a single oblique layer however far the pointer travelled. The sphere brush does
not project its centres, so a stroke sweeps a true tube.

## Where the code lives

| File                                                                 | Role                                             |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| `core/src/utilities/voxelSlab/iterateVoxelsInShape.ts`               | The iterator                                     |
| `core/src/utilities/voxelSlab/shapes/`                               | The shapes, including `createUnionShape`         |
| `tools/src/tools/segmentation/strategies/utils/brushVoxelSlab.ts`    | The brush shapes and the fill                    |
| `tools/src/tools/segmentation/strategies/compositions/regionFill.ts` | The `Fill` callback                              |
| `tools/src/utilities/sampleAreaAnnotationVoxels.ts`                  | The annotation side, and the shared index bounds |
