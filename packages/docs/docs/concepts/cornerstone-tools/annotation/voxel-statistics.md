---
id: voxel-statistics
title: Voxel Statistics and Oblique Views
summary: One iterator for the voxels a tool's shape covers, at any orientation, plus the three rules it evaluates - which voxels an area annotation contains (Rule M), which voxels a brush fill writes (Rule F), and which annotations a viewport displays (Rule D)
---

# Voxel Statistics and Oblique Views

## The problem

A tool draws a shape on a viewport, and that shape stands for a set of voxels.
An area annotation is a **prism**: the outline sweeps along the view normal, and
the prism holds every voxel inside the outline and within the annotation's own
thickness. Some tools draw a **solid** instead, such as a sphere or a box, and
the solid holds every voxel inside it. Either way the tool needs the same thing:
every voxel of that set, exactly once each.

Producing that set is harder than it looks, and Cornerstone3D already contains
four separate attempts at it:

| tool                    | how it walks the voxels                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `RectangleROITool`      | the index-space bounding box of the two corner handles, and no shape test at all                                |
| `EllipticalROITool`     | the same bounding box, plus `pointInEllipse` on every voxel in the box                                          |
| `CircleROITool`         | the same bounding box, plus a sphere test on every voxel in the box                                             |
| `PlanarFreehandROITool` | the same bounding box, plus `worldToCanvas` on every voxel, and a crossing count that carries state across rows |

Every one of the four is a bounding box paired with a per-voxel test, and every
one of the four is wrong in a different way. The rectangle omits the test, so it
is exact for an axis-aligned rectangle and it over-counts the corners of a
rotated one. The freehand tool works in canvas coordinates, so the answer moves
when the user zooms. All four build the box from one slice, so all four return a
sheet one voxel thick. Three failure modes follow, and no choice of sample step
size reaches any of the three.

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

The four traversals are also slow, and each one carries its own special cases.
The bounding box of a disc holds `4 / π` times as many voxels as the disc, so a
quarter of the per-voxel tests are wasted before the plane is even oblique. Tilt
the plane and the box becomes the 3D box around the tilted prism, which holds
many times the voxels of the prism itself.

## The solution: one iterator

`iterateVoxelsInShape` walks the voxel set directly, and no tool needs a
traversal of its own. It works in index space, where the depth test is exactly
linear in the integer voxel indices. For each row it therefore solves two closed
intervals in closed form, one from the slab and one from the shape, intersects
the two, and emits the integers inside. It tests no voxel that it does not emit,
and it reads nothing from the display.

An area statistic becomes a loop over that iterator and an accumulator. The tool
supplies the shape and the thickness, the iterator supplies the voxels, and the
mean, the maximum and the count follow from one pass. Rule M, Rule F and Rule D
below define the set that the iterator produces, so a tool that uses the
iterator gets the defined answer without knowing the arithmetic.

Rule M, Rule F and Rule D are **normative**. Issue
[#2889](https://github.com/cornerstonejs/cornerstone3D/issues/2889) states Rule
M and Rule D as well. The index-space arithmetic that evaluates Rule M quickly
is an implementation detail, and anyone may change it as long as it selects the
same voxels.

### The base case is the base of the iterator

The ordinary case is a non-oblique view of a single layer: the plane lies on the
acquisition axis, and the annotation is one voxel thick. The iterator does not
special-case that view. It **is** the base of the iterator: the outer axis
becomes the slice axis, the depth interval resolves to one layer, and the inner
loop emits runs along `i` for each `j`, in memory order. The general oblique
case is the same three loops with a depth interval that moves.

Even in that base case the iterator is generally faster than the four
traversals, because a shape that supplies runs needs no per-voxel test. The
older code tests every voxel of the bounding box and rejects most of them. The
iterator solves the row once and emits an interval, so the count of shape tests
falls from the size of the box to zero.

The gap widens as the geometry gets harder. In a stretched space, where the
spacing is anisotropic, a circle in world coordinates is an eccentric ellipse in
index space, and a rectangle rotated in the plane is a rotated box in index
space. The bounding box of either grows faster than its content, so a
bounding-box traversal wastes more of its work. The closed form does not care:
an ellipsoid solves one quadratic per row, and a box solves one linear
inequality per axis, at every angle and at every aspect ratio.

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

## Rule F: brush fill

Rule M answers a measurement question. A brush fill asks a different question,
and Rule M gives the wrong answer to it.

A brush fill writes a voxel when the voxel obeys two conditions:

1. The voxel centre lies within `max(F, T_v) / 2` of the fill plane, measured
   along the normal. `F` is the depth that the fill covers, and `F` defaults to
   `T_v`.
2. The projection of that centre along the normal onto the plane falls inside
   the 2D shape.

The half width of Rule F is `max(F, T_v) / 2`, and the half width of Rule M is
`(T + T_v) / 2`. For the default of one voxel of depth, Rule M gives `T_v` and
Rule F gives `T_v / 2`. Rule M is therefore twice as deep, and it writes two
layers where the user drew one.

The depth of `T_v` that Rule F gives is exact, and it is not a compromise. The
slab of Rule F has a thickness of `T_v`, which is the L1 length of the
index-space normal `g`, where `gᵢ = sᵢ * (aᵢ · n)`. A slab of that thickness is
a standard digital plane. Two properties follow, and the two properties hold
together at every orientation:

- **No hole.** The slab holds every voxel that the continuous plane passes
  through.
- **No overlap.** Two such slabs share no voxel when the two planes are `T_v`
  apart along the normal.

Consecutive fills therefore tile the volume exactly, in the same way that
consecutive digital lines tile a 2D grid. A thinner slab breaks the first
property, and a thicker slab breaks the second one.

:::caution
The tiling holds when the planes are `T_v` apart. A viewport that steps by a
different distance shows one fill on two consecutive slices, and the fill looks
like a bleed into the neighbouring slice. The fill is correct in that case, and
the step is wrong. See the Spacing section below for the three measures.
:::

## Rule D: display

A viewport shows a plane when the distance from the plane point to the focal
point, along the normal, is within `(t + T) / 2`.

The effects across modalities are intended. An annotation on one thick NM slice
can correctly appear on two thin CT slices, and an annotation that spans two CT
slices can correctly appear on one NM slice.

As in Rule M the comparison is strict and tightened by a relative epsilon,
because the common case puts the neighbouring slice exactly on the boundary and
must exclude it. A viewport shows the annotations created on its own slice, not
those on the next one. Here the epsilon is relative to the half width, and not
to the voxel thickness `T_v` that Rule M uses, because `T_v` needs a volume and
a display decision is made without one.

A reference that records no thickness falls back to an exact plane match to
within `isEqual`. Any annotation created before `PlaneRestriction.referencePlaneThickness`
existed records no thickness, and a wider visibility would change which slices
those annotations appear on.

## Where `T` comes from

A new annotation takes `T` once, at creation, from the slab thickness of the
viewport that the user drew in. `Viewport.getReferencePlaneThickness` supplies the
value, and `BaseVolumeViewport` overrides that method. After creation, `T`
belongs to the annotation and lives on `PlaneRestriction.referencePlaneThickness`.

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

### Two conversions on the volume viewport

`BaseVolumeViewport.getReferencePlaneThickness` applies two conversions that a
reader of the raw slab value would miss.

**It doubles the value.** `getSlabThickness` returns the number passed to
`setOrientationOfClippingPlanes`, which places the clipping planes at
`focalPoint ± slabThickness`. The stored number is therefore a _half_
thickness on that render path, and the geometric thickness is twice it. The
generic planar path uses `vtkImageResliceMapper`, where the same field is
already a full thickness, so the doubling belongs on the volume viewport and
not in the shared reference code.

**It maps the rendering minimum to undefined.** A slab at
`RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS` means "no slab was requested",
not "a 0.05 mm slab was requested". Recording it literally would give
`T = 0.1 mm`, which is thinner than any real voxel and would break the
guarantee that an annotation always covers at least one layer. Mapping it to
undefined lets `T` fall back to one voxel along the normal.

## Using the iterator

A tool builds a shape, then walks the voxels:

```ts
import { utilities } from '@cornerstonejs/core';

const { createPolylineShape, iterateVoxelsInShape } = utilities.voxelSlab;

const shape = createPolylineShape({
  volume, // { dimensions, direction, spacing, origin }
  planePoint, // the annotation plane anchor
  viewPlaneNormal, // unit length
  polyline, // the outline in world coordinates
});

for (const { ijk, center } of iterateVoxelsInShape({
  volume,
  planePoint,
  viewPlaneNormal,
  referencePlaneThickness:
    shape.getRequiredThickness() || referencePlaneThickness,
  getShapeRuns: shape.getRuns,
})) {
  // accumulate statistics
}
```

A tool with a different outline replaces `createPolylineShape` with
`createEllipseShape` or `createRectangleShape`, and changes nothing else.

Two details matter for a consumer:

- `ijk` and `center` are **reused between iterations**. Copy either one before
  you retain it.
- The shape is intersected with the slab, and not unioned with it. Pass
  `getRequiredThickness()` as the `referencePlaneThickness` unless you deliberately
  want the slab to clip the shape.

Every shape exposes `containsPoint` as its definition beside `getRuns` as the
optimisation. Replace `getShapeRuns: shape.getRuns` with
`isInShape: shape.containsPoint` and the voxel set must stay identical, only
slower. That replacement is the cheapest way to debug a shape.

## Sampling the values

The iterator yields indices and centres, and no values. A tool that measures
needs the value of every voxel as well, so `sampleVoxelsInShape` wraps the
iterator and reads it:

```ts
const { createPolylineShape, sampleVoxelsInShape } = utilities.voxelSlab;

const samples = sampleVoxelsInShape({
  volume,
  planePoint,
  viewPlaneNormal,
  referencePlaneThickness:
    shape.getRequiredThickness() || referencePlaneThickness,
  bounds, // the index box the annotation can reach
  getShapeRuns: shape.getRuns,
  voxelManager,
  onSample: statsCallback,
  storePointData,
});
```

`onSample` receives `{ value, pointLPS, pointIJK }` for every voxel that has a
value, in iteration order, which is what a statistics calculator consumes. A
voxel the `voxelManager` holds no value for is skipped. `storePointData` also
collects the samples and returns them, at the cost of one object per voxel, so a
caller that only accumulates statistics leaves it off and uses `onSample`.

The `bounds` must allow for the thickness that `referencePlaneThickness`
resolves to. A caller that dilates its bounds for the annotation's own
thickness, and then hands a solid shape's larger depth to the iterator, loses
every layer past the first.

### The tools share one path

Every area annotation tool in `@cornerstonejs/tools` reaches the sampler through
`utilities.sampleAreaAnnotationVoxels`. That function takes the annotation and
the target image, and derives the plane, the normal, the thickness and the index
bounds. Only the shape differs between the tools:

```ts
const pointsInShape = utilities.sampleAreaAnnotationVoxels({
  annotation,
  image, // the target's IImageData, and not image.imageData
  voxelManager,
  points, // the world points the shape is built from
  boundsMargin, // how far the shape reaches past those points
  createShape: ({ volume, planePoint, viewPlaneNormal }) =>
    createCircleShape({
      volume,
      planePoint,
      viewPlaneNormal,
      centerWorld,
      radius,
    }),
  onSample: statsCallback,
  storePointData,
});
```

Two arguments carry the whole of what a tool must get right:

- `points` and `boundsMargin` give the index bounds. The outline of a polyline,
  and the four corners of a rectangle, enclose the shape, so those tools leave
  `boundsMargin` at 0. A circle and an ellipse only touch their handles, so they
  pass the largest radius: the outline bulges out of the box of the handles as
  soon as that box is not aligned with the index axes, and a circle drawn with
  `simplified` handles keeps one handle only.
- `createShape` returns nothing for a degenerate annotation, such as a circle of
  no radius, and the sampler then measures no voxel. The shape factories throw on
  one, and an exception inside the render loop stops the whole viewport.

The plane comes from `annotation.metadata`, and never from a viewport. Every tool
records `viewPlaneNormal` when the user draws the annotation. An annotation that
arrives from a DICOM SR records no normal, because an SR stores no camera, and
`updatePlaneRestriction` records two in-plane vectors instead; the sampler then
crosses those two vectors, which describes the same plane. Two points give one
in-plane vector and no plane, so a two point annotation that arrives without a
normal reports no statistics.

## The shape contract

Every shape implements `VoxelSlabShape`, which has three members.

`containsPoint(point)` is the **definition** of the shape. It takes a voxel
centre in world coordinates and answers whether the shape contains it.

`getRuns(outer, row, depthRun, slab)` is the **optimisation**. It yields
inclusive `[min, max]` runs along the slab's column axis for one
`(outer, row)` position, and it must select the same voxels that
`containsPoint` does. Yielding nothing means the shape does not reach that row.
A provider works at one of three levels of precision:

| level          | contract                                                                             | example                                           |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| exact          | one run that is exactly the covered voxels                                           | a rectangle, or an axis-aligned row of an ellipse |
| exact-multiple | several disjoint runs, for a row that enters and leaves the shape more than once     | a non-convex freehand polygon                     |
| approximate    | a superset run, with `isInShape` supplied so the iterator tests each voxel inside it | any new shape, before it is optimised             |

`depthRun` is the run the depth test already permits. A provider may clip to it
but need not, because the iterator intersects the results either way.

`getRequiredThickness()` returns the smallest `T` for which the slab contains
the whole shape. A planar shape returns 0, because it has no extent along the
normal and any `T` works. A shape with depth returns that depth, and a smaller
`referencePlaneThickness` will clip it.

`createEllipseShape` and `createRectangleShape` each carry a depth, and each
applies its own. `createPolylineShape` is always planar and returns 0, so the
caller's `referencePlaneThickness` alone decides how far the slab reaches along
the normal. A caller that wants a polyline prism passes the prism depth as that
thickness.

### Polyline rings and holes

`createPolylineShape` accepts either a single ring or an array of rings. Each
ring is closed, so do not repeat the first point at the end. Points are
projected onto the annotation plane, which handles an outline that carries a
little depth error, as a drawn one always does.

`planePoint` is optional for this shape, because every point of the outline
lies in the plane already, and the first point of the first ring is the
default. Pass the annotation's own anchor when you have one: a drawn vertex
carries rounding error that the anchor does not. Whichever anchor you use, give
the shape and the iterator the **same** one, or the two describe different
slabs.

The interior is the even-odd rule over every edge of every ring, and the parity
accumulates across the rings rather than per ring. That single rule gives:

- **internal holes** — give the hole as its own ring and it is excluded;
- **nesting to any depth** — a ring inside a hole is solid again;
- **disjoint regions** — separate rings describe separate regions.

Winding direction does not matter, so a hole ring need not be wound opposite to
its parent. A single ring need be neither convex nor simple, because even-odd
resolves a self-intersecting one too.

:::warning
Do not flatten multiple rings into one array. Flattening inserts an edge from
the end of each ring to the start of the next. That does not raise an error; it
quietly measures a different shape.
:::

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
| polyline outline   | the crossings of the line with every edge of every ring, sorted, with consecutive pairs bounding the inside intervals        |

A non-convex polyline therefore yields several runs, which is the exact-multiple
case the iterator supports.

## Boundary handling

**A voxel centre that lies on a shape outline is inside the shape.** Three
independent cases made that rule necessary:

- A circle of radius 5 on an integer grid puts voxel centres exactly on its
  outline, at `(5, 0)` and at every Pythagorean point such as `(3, 4)`.
  `containsPoint` adds the squares and can give a little more than 1, while
  `getRuns` solves for the roots and gives exactly 5. Both therefore compare
  against a boundary that a relative epsilon widens.
- The even-odd rule gives the interior of a polyline, but `containsPoint` casts a
  ray along one plane axis while `getRuns` intersects a line along the direction
  that the column axis projects to. The two tie rules degenerate at different
  geometry. A rectangular polyline drawn on voxel boundaries kept a row at one end
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

| function                            | formula                          | answers                                              |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `getSpacingInNormalDirection`       | L2, `sqrt(Σ (d·aᵢ·sᵢ)²)`         | how far the camera dollies before it sees new voxels |
| `getVoxelThicknessAlongNormal`      | L1, `Σ \|d·aᵢ\|·sᵢ`              | how far one voxel reaches along the direction        |
| `getEffectiveSpacingAlongDirection` | harmonic, `1/sqrt(Σ (d·aᵢ/sᵢ)²)` | how far to step to cross one voxel                   |

All three agree whenever the normal is parallel to a voxel axis, which covers any
acquisition-orientation view, and they diverge for an oblique normal. For
1×1×3 mm voxels viewed at 45 degrees between an in-plane axis and the slice
axis, the L1 value is `2*sqrt(2) ≈ 2.83 mm` against `sqrt(5) ≈ 2.24 mm` for L2,
and `≈ 1.34 mm` for the harmonic form.

Rule M uses `T_v` and nothing else. Rule F also uses `T_v`, because the L1
length is what makes the slab a standard digital plane. The harmonic form
belongs to a tool that walks a line, such as the sub-pixel resampler of the
freehand ROI: it needs a step that crosses one voxel per step, and neither of
the other two measures answers that.

A slice step is an overlap test, so a slice step needs the L1 value as well. A
step of L2 is shorter than `T_v` for an oblique normal, and two consecutive
slice positions then fall inside one digital plane.

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
| `iterateVoxelsInShape`, `collectVoxelsInShape`                         | the traversal                            |
| `sampleVoxelsInShape`                                                  | the traversal, with the values read      |
| `createEllipseShape`, `createCircleShape`                              | ellipse in-plane, ellipsoid out-of-plane |
| `createRectangleShape`                                                 | rectangle in-plane, box out-of-plane     |
| `createPolylineShape`                                                  | a planar polyline, with internal holes   |
| `getVoxelThicknessAlongNormal`                                         | `T_v`                                    |
| `isPlaneDepthViewable`                                                 | the depth half of Rule D                 |
| `buildIndexSpaceSlab`, `getDepthRun`, `getSlabAxisBound`               | the index-space run arithmetic           |
| `isVoxelCenterInSlab`, `getMembershipHalfWidth`, `getDisplayHalfWidth` | the Rule M and Rule D predicates         |
| `getFillHalfWidth`                                                     | the half width of Rule F                 |

Two more exports sit outside that namespace:

| export                                                            | purpose                                       |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `utilities.getEffectiveSpacingAlongDirection`, in core            | the step that crosses one voxel along a line  |
| `utilities.sampleAreaAnnotationVoxels`, in `@cornerstonejs/tools` | the one path every area annotation tool takes |
