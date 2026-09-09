---
id: voxel-statistics
title: Voxel Statistics and Oblique Views
summary: Which voxels an area annotation covers (Rule M), which annotations a viewport displays (Rule D), and how the shared voxel slab iterator evaluates both exactly at any orientation
---

# Voxel Statistics and Oblique Views

An area annotation reports a mean, a maximum and an area. Those numbers are a
function of a voxel set, and this page defines that set.

Rule M and Rule D below are **normative**. Issue
[#2889](https://github.com/cornerstonejs/cornerstone3D/issues/2889) states them
as well. The index-space arithmetic that evaluates Rule M quickly is an
implementation detail, and anyone may change it as long as it selects the same
voxels.

## Why the rules exist

Cornerstone3D calculated ROI statistics for years without a definition of which
voxels those statistics cover. Each tool wrote its own traversal, and no
traversal was correct in an oblique view. Three failure modes followed, and none
of the three is reachable by a change to a sample step size.

**A nearest-neighbour sample cannot cover an integer lattice under rotation.**
At a 45° in-plane oblique angle, samples along `(0.707, 0.707)` in IJK round to
`(0,0), (1,1), (2,2)…` and never visit `(1,0)` or `(0,1)`. That is about half the
voxels. The sub-pixel phase of the camera decides which half the code skips, so
a half-pixel pan changes the reported maximum.

**A sampled set derived from the canvas depends on the display.** Such a set is
a function of the zoom, the pan, the canvas size and `devicePixelRatio`. The
same annotation over the same data then reports a different mean, because the
display state differed when the tool recalculated the statistics.

**A single-plane traversal returns a sheet one voxel thick.** Draw a freehand
annotation on an NM series with 1 mm slices, and fuse that series with a CT
series at 0.5 mm in the same orientation. The correct CT maximum must examine
two CT voxels for each in-plane location. Extra in-plane samples never produce
the second voxel, because every sample lies on the same plane.

## Rule M: voxel membership

A voxel belongs to an area annotation when the voxel obeys two conditions:

1. The voxel centre lies within `(T + T_v) / 2` of the annotation plane, measured
   along the normal.
2. The projection of that centre along the normal onto the plane falls inside
   the 2D shape.

`T` is the thickness of the annotation. `T_v` is the voxel thickness along the
normal.

The viewport slab thickness `t` does not appear in Rule M. That absence is the
purpose of the rule: the statistics cannot change because a user zoomed the
viewport, resized the canvas, or increased the slab.

The `T_v` term widens the slab by half a voxel on each side, so a voxel
qualifies exactly when the voxel itself overlaps the slab. The term has no
effect in the default case of `T = T_v` anchored on a voxel centre, which gives
one layer either way. The term matters for a plane that misses the voxel
centres, which would otherwise select nothing, and for a thicker slab, where an
unwidened test asked for two voxels of thickness would select one.

:::note
A plane exactly midway between two voxel centres selects **both** layers. Both
voxels overlap the slab by equal amounts, so no principled way to choose one
exists, and a choice would make the count depend on a rounding tie. A mean over
two layers is not the same number as a mean over one, and MPR at a half-slice
position is the ordinary way to reach this state.
:::

## Rule D: display

A viewport shows a plane when the distance from the plane point to the focal
point, along the normal, is within `(t + T) / 2`.

The effects across modalities are intended. An annotation on one thick NM slice
can correctly appear on two thin CT slices, and an annotation that spans two CT
slices can correctly appear on one NM slice.

A reference that records no thickness keeps the historical behaviour, which is
an exact plane match to within `isEqual`. Every annotation that predates
`PlaneRestriction.thickness` records none, and a wider visibility would change
what existing viewers show.

## Where `T` comes from

A new annotation takes `T` once, at creation, from the slab thickness of the
viewport that the user drew in. `Viewport.getReferenceThickness` supplies the
value, and `BaseVolumeViewport` overrides that method. After creation, `T`
belongs to the annotation and lives on `PlaneRestriction.thickness`.

When a reference records no thickness, `T` defaults to one voxel along the
normal. A stack viewport uses that default, and so does every annotation that
predates the field.

A `T` of 0 or less also counts as unrecorded and takes the same default. A
planar shape reports 0 from `getRequiredThickness`, and a caller may pass that
value straight to the iterator, so 0 has to mean "the shape asks for no depth of
its own".

Reading the slab once at creation does not contradict the independence of
Rule M from `t`. The code reads the slab when it creates the reference, and
never when it recalculates the statistics.

## Using the iterator

A tool builds a shape, then walks the voxels:

```ts
import { utilities } from '@cornerstonejs/core';

const { createContourShape, iterateVoxelsInSlab } = utilities.voxelSlab;

const shape = createContourShape({
  volume, // { dimensions, direction, spacing, origin }
  planePoint, // the annotation plane anchor
  normal, // the view plane normal, unit length
  polyline, // the outline in world coordinates
});

for (const { ijk, center } of iterateVoxelsInSlab({
  volume,
  planePoint,
  normal,
  annotationThickness: shape.getRequiredThickness() || annotationThickness,
  getShapeRuns: shape.getRuns,
})) {
  // accumulate statistics
}
```

A tool with a different outline replaces `createContourShape` with
`createEllipseShape` or `createRectangleShape`, and changes nothing else.

Two details matter for a consumer:

- `ijk` and `center` are **reused between iterations**. Copy either one before
  you retain it.
- The shape is intersected with the slab, and not unioned with it. Pass
  `getRequiredThickness()` as the `annotationThickness` unless you deliberately
  want the slab to clip the shape.

Every shape exposes `containsPoint` as its definition beside `getRuns` as the
optimisation. Replace `getShapeRuns: shape.getRuns` with
`isInShape: shape.containsPoint` and the voxel set must stay identical, only
slower. That replacement is the cheapest way to debug a shape.

## Why the runs are exact

The depth half of Rule M is exactly linear in the integer voxel indices. A voxel
at index `p` has its centre at `origin + M p` in world space, where `M` is the
index-to-world matrix, so:

```
  depth(p) = (centre - P0) . n = p . g + c0
  g  = Mᵀ n      (the index space normal)
  c0 = (origin - P0) . n
```

`g` and `c0` are constants, so along any single axis the voxels that satisfy
`|depth(p)| < halfWidth` form a closed-form interval. The iterator therefore
emits exact integer runs instead of a test for each voxel, and this holds at
every orientation, oblique included.

`g` is deliberately not normalised. Its components are the change in world depth
per unit step of each index, which is what the run arithmetic needs. In
acquisition orientation `g` comes out parallel to `(0, 0, 1)`, because the
normal is the k axis, so `d0 . n` and `d1 . n` vanish and only `s2 * (d2 . n)`
survives.

### Axis roles

Iteration nests outer → row → column.

- `outerAxis` is `argmax |g|`, the axis whose index step moves the depth most.
  A sweep of that axis outermost makes each outer step cover a thin band of the
  volume, and it leaves the two axes that lie closest to the annotation plane.
- `rowAxis` and `columnAxis` are those two remaining axes. A 2D shape expresses
  its spans naturally as runs along `columnAxis` for each `rowAxis` value, which
  is why the shape constraint belongs innermost. For each `(outer, row)` pair the
  depth constraint gives one interval along `columnAxis`, the shape gives one or
  more, and the iterator emits their intersection.

The depth interval along `columnAxis` is often unbounded. In acquisition
orientation `g[columnAxis]` is zero, so the depth does not vary along that axis
and the shape is the only binding constraint.

Each shape reaches its exact runs by its own route:

| shape              | route                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| ellipse, ellipsoid | a line substituted into the quadratic form gives a quadratic in the column index, whose real roots bound one interval        |
| rectangle, box     | each face is a linear constraint, so each gives one interval, and their intersection is one interval because a box is convex |
| contour prism      | the crossings of the line with every edge of every ring, sorted, with consecutive pairs bounding the inside intervals        |

A non-convex contour therefore yields several runs, which is the exact-multiple
case the iterator supports.

## Boundary handling

**A voxel centre that lies on a shape outline is inside the shape.** Three
independent cases made that rule necessary:

- A circle of radius 5 on an integer grid puts voxel centres exactly on its
  outline, at `(5, 0)` and at every Pythagorean point such as `(3, 4)`.
  `containsPoint` adds the squares and can give a little more than 1, while
  `getRuns` solves for the roots and gives exactly 5. Both therefore compare
  against a boundary that a relative epsilon widens.
- The even-odd rule gives the interior of a contour, but `containsPoint` casts a
  ray along one plane axis while `getRuns` intersects a line along the direction
  that the column axis projects to. The two tie rules degenerate at different
  geometry. A rectangular contour drawn on voxel boundaries kept a row at one end
  and lost it at the other.
- The crossing test cannot see an outline edge that runs along a run line,
  because both end points lie on the same side of a line that holds them. Such an
  edge, and any vertex that touches the line, supplies its extent directly, and
  the code merges every contribution so that no voxel is emitted twice.

The depth test moves in the opposite direction. `SLAB_RELATIVE_EPSILON` tightens
it rather than widens it, because there the neighbouring layer must be excluded.

### Why the depth test is strict

The slab tests use `<` and not `<=`, because the default `T = T_v` places the
neighbouring voxel centres exactly on the slab boundary, and an
acquisition-orientation annotation must cover exactly one layer.

Signed distances come from dot products over world coordinates, so a value that
is mathematically on the boundary lands on either side of it. Without a
tolerance the most common case in the whole system would pick up two extra
layers at random. The tolerance is relative to the voxel thickness, and not
absolute, because spacings in medical imaging range from microns to centimetres.
The value 1e-5 sits comfortably above float32 error, which is roughly 1e-7
relative, and most inputs carry float32 error because gl-matrix vectors and the
rest of the rendering geometry are float32.

The strict rule has one visible consequence. A thickness that exceeds an exact
voxel multiple by less than `2 * SLAB_RELATIVE_EPSILON * T_v` still selects the
smaller number of layers. At `T_v = 1 mm` that dead band is 20 nm wide, so it is
unreachable in practice, but `T = T_v + 1e-6` does behave as `T = T_v` rather
than pull in both neighbours.

## Voxel thickness along the normal

`T_v` is the support width of the voxel box along the normal:

```
  T_v = Σᵢ |dᵢ · n| * sᵢ
```

This is an L1 length, and it is deliberately not the L2 length that
`getSpacingInNormalDirection` returns. Only the L1 length answers "how far does
this voxel reach along the normal", which is what a voxel/slab overlap test
needs.

| function                       | formula                  | answers                                              |
| ------------------------------ | ------------------------ | ---------------------------------------------------- |
| `getSpacingInNormalDirection`  | L2, `sqrt(Σ (d·aᵢ·sᵢ)²)` | how far the camera dollies before it sees new voxels |
| `getVoxelThicknessAlongNormal` | L1, `Σ \|d·aᵢ\|·sᵢ`      | how far one voxel reaches along the direction        |

The two agree whenever the normal is parallel to a voxel axis, which covers any
acquisition-orientation view, and they diverge for an oblique normal. For
1×1×3 mm voxels viewed at 45 degrees between an in-plane axis and the slice
axis, the L1 value is `2*sqrt(2) ≈ 2.83 mm` against `sqrt(5) ≈ 2.24 mm` for L2.

## Cost

The cost is proportional to the voxels that the iterator emits, plus the rows
that it touches. The cost is not proportional to the volume of a bounding box,
and not to the canvas area. An ROI at 8× magnification costs what it costs at
fit-to-window.

Supply `bounds` when the tool already knows the index-space bounding box of the
annotation. Bounds only narrow: each axis intersects the volume extent, so a box
that reaches outside the volume still yields no index outside it.

## API

Everything here is exported under `utilities.voxelSlab`.

| export                                                                 | purpose                                  |
| ---------------------------------------------------------------------- | ---------------------------------------- |
| `iterateVoxelsInSlab`, `collectVoxelsInSlab`                           | the traversal                            |
| `createEllipseShape`, `createCircleShape`                              | ellipse in-plane, ellipsoid out-of-plane |
| `createRectangleShape`                                                 | rectangle in-plane, box out-of-plane     |
| `createContourShape`                                                   | a contour prism, with internal holes     |
| `getVoxelThicknessAlongNormal`                                         | `T_v`                                    |
| `isPlaneDepthViewable`                                                 | the depth half of Rule D                 |
| `buildIndexSpaceSlab`, `getDepthRun`, `getSlabAxisBound`               | the index-space run arithmetic           |
| `isVoxelCenterInSlab`, `getMembershipHalfWidth`, `getDisplayHalfWidth` | the Rule M and Rule D predicates         |
