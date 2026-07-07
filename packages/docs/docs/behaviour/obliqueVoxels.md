---
id: obliqueVoxels
title: Oblique Voxels (Integer Oblique Iterator)
summary: Behaviour definition for the unimodular integer oblique voxel iterator that drives circular, spherical and rectangular segmentation brush fills on rotated / oblique viewports, including usage and the volumes / test cases that lock the behaviour in.
---

# Oblique Voxels — Behaviour Definition

This page defines the **behaviour** of the integer oblique voxel iterator used
by the segmentation brush fills (circle, sphere, rectangle) on rotated /
oblique viewports. It is the source-of-truth description of what the iterator
guarantees, how to use it, and how those guarantees map onto the volumes and
test cases that were added. See the [Behaviour index](./index.md) for how
behaviour definitions are organized.

There are two distinct coordinate systems, and keeping them separate is central
to the behaviour:

1. **Continuous / fractional oblique geometry** — used for exact plane position,
   display geometry and measurements. May use fractional `u, v, w`. This is
   unchanged and lives in helpers such as `getInPlaneSpacingAndXYDirections` and
   `iterateOverPlane`.
2. **Integer oblique ownership / iteration** — used for fast segmentation voxel
   iteration. Uses integer `u, v, w`. This page is about (2).

## The unimodular integer oblique basis

### Definition

Given a volume with an (orthonormal) direction matrix and voxel spacing, and a
world-space view plane normal, the iterator builds an **integer** basis
`[A B C]` and a primitive integer plane normal `N = [ni, nj, nk]` such that:

```
N · A = 0          // A is in-plane
N · B = 0          // B is in-plane
N · C = 1          // C advances exactly one plane
det([A B C]) = ±1  // the basis is unimodular
```

`A`, `B`, `C` and `N` are all integer `Point3` vectors. Voxels are addressed by

```
ijk = origin + u*A + v*B + w*C          // origin is usually [0, 0, 0]
```

Because `[A B C]` is a **unimodular integer matrix**, this map is a bijection
between integer `(u, v, w)` and integer `ijk`. That single fact produces every
behaviour guarantee below:

- **Single ownership** — every integer voxel belongs to exactly one integer `w`
  plane (`w = ` the third coordinate of `[A B C]⁻¹ (ijk − origin)`, which is
  itself integer because the inverse of a unimodular integer matrix is integer).
- **Disjoint planes** — planes `w`, `w ± 1` share no voxel.
- **No repeats, full coverage** — iterating the full `(u, v, w)` envelope of a
  volume visits every voxel of that volume exactly once.

### Choosing the integer normal `N`

The world-space view plane normal is first converted to an **index-space
covector**. With `world = origin + M · ijk`, the plane covector is
`g ≈ transpose(M) · viewPlaneNormalWorld` (per-axis, `g[a] = spacing[a] · (axisₐ ·
n)`). A primitive integer `N` (with `gcd(ni, nj, nk) = 1`) is then chosen to
approximate the direction of `g`.

**Normal accuracy is bounded by volume size.** An integer `N` only approximates
`g`, so a single integer plane is a staircase that tilts slightly from the true
plane. Over the volume the edge voxels of one plane drift along the true normal
by `volumeExtent · sin(θ)`, where `θ` is the angle between `N` and `g`. `N` is
selected so this **edge drift never exceeds one diagonal voxel distance in the
direction of the normal** (`√3` in index units by default). Consequently:

- small volumes accept a coarse normal (e.g. an axis-aligned `N`),
- large volumes automatically require a finer, more accurate integer normal,
- the denominator search grows with the volume to reach the required accuracy.

### Building `[A B C]` from `N`

The basis is built with two extended-GCD (Bézout) steps. For primitive
`N = [a, b, c]` with `d = gcd(b, c)` (so `b·y₀ + c·z₀ = d`) and `a·s + d·t = 1`:

```
A = (0, c/d, -b/d)
B = (-d, a·y₀, a·z₀)
C = (s, t·y₀, t·z₀)
```

which gives `det([A B C]) = a·s + d·t = 1`. The axis-aligned case
(`b = c = 0`, `N = (±1, 0, 0)`) is handled explicitly. The raw `A`, `B` are then
**reoriented to the viewport** (`viewRight`, `viewUp`) using only
unimodular-preserving operations (swap `A`/`B`, flip signs), comparing `M·A` and
`M·B` against the world view axes so iteration order is stable and
deterministic.

## Iteration behaviour

The hot loop is `w → u → v` with an incremental inner step:

```ts
for (let w = wRange.min; w <= wRange.max; w++) {
  const uRange = getURangeForW(w);
  for (let u = uRange.min; u <= uRange.max; u++) {
    const vRange = getVRangeForWU(w, u); // clipped to the voxel box
    let ijk = ijkFromUVW(u, vRange.min, w, basis);
    for (let v = vRange.min; v <= vRange.max; v++) {
      visitVoxel(ijk); // already in-bounds + in-shape
      ijk = addPoint3(ijk, basis.B); // no per-voxel transform
    }
  }
}
```

- The final `v` line is clipped once against the volume box with
  `clipIntegerLineToBox`, so the inner loop needs no per-voxel bounds check.
- When the shape's `(u, v, w)` ranges already guarantee inclusion (spheres /
  ellipsoids), there is no per-voxel shape test either.

## Shape behaviour

### Sphere / ellipsoid — exact analytic ranges

An index-space quadratic `(p − center)ᵀ Q (p − center) ≤ 1` is transformed into
`(u, v, w)` coordinates via `H = Lᵀ Q L`, `q₀ = L⁻¹(center − origin)` (with
`L = [A B C]`). Nested integer ranges are then solved analytically:

- `getWRangeForUVWEllipsoid` → the `w` planes the shape touches,
- `getURangeForW` → the `u` span on a plane (marginalized over `v`),
- `getVRangeForWU` → the `v` span for a given `(w, u)`.

No per-voxel inclusion test is required for spheres.

### Circle — thin oblique slab

The planar circle is a thin ellipsoid in `(u, v, w)` (a slab one voxel thick
along the normal) using the same range machinery, so a single-click circle fill
is one oblique plane's worth of voxels with no adjacent-slice leakage.

### Rectangle — deterministic viewport-aligned fill

The rectangle uses the integer basis for deterministic plane ownership, with a
stable corner ordering (`orderRectangleCorners`) that reconstructs the in-plane
axes from the corners themselves (so it is correct on any orientation). A
conservative `(u, v)` range is combined with a final world-space rectangle
predicate for exact inclusion. This is the one shape that still uses a final
predicate; the range clipping is conservative rather than exact.

## Usage

Most callers use the high-level entry point:

```ts
const basis = csUtils.obliqueIntegerIterator.createObliqueIntegerBasis({
  dimensions, // volume voxel dimensions
  direction, // orthonormal direction matrix
  spacing, // voxel spacing
  viewPlaneNormal, // world-space plane normal
  viewUp, // world-space up axis (deterministic orientation)
  viewRight, // optional world-space right axis
  // maxNormalDrift,   // default √3 (one voxel diagonal)
});

csUtils.obliqueIntegerIterator.forEachObliqueVoxel(basis, {
  dimensions, // clip the final v-line to the voxel box
  wRange,
  getURangeForW,
  getVRangeForWU, // shape ranges (optional)
  predicate, // optional final inclusion test
  visit: ({ ijk, u, v, w }) => {
    /* own this voxel */
  },
});
```

Inside the segmentation brushes this is wrapped by the internal
`obliqueIntegerFill` helpers (`createCircleObliqueIntegerFill`,
`createSphereObliqueIntegerFill`, `createRectangleObliqueIntegerFill`), which set
`operationData.obliqueIntegerFill`. The `regionFill` composition uses that
descriptor when present and otherwise falls back to the axis-aligned
bounding-box iterator, so the change is backward compatible.

## Area / volume from voxel count

Because the basis is unimodular, each in-plane voxel represents a uniform
world-space cell area `cellArea = |M·A × M·B|`, and each plane is a graph (one
voxel per `(u, v)`). Therefore **counting the filled voxels of an oblique circle
and multiplying by `cellArea` is an unbiased estimate of the circle area** — the
only residual error is the standard lattice / Gauss-circle quantization `O(1/r)`,
identical to an axis-aligned circle. There is no obliquity-specific bias, which
is precisely what the rounded fractional sampling approach could not guarantee.

## Volumes and test cases

The behaviour is locked in by unit tests. These describe the exact volumes used
so the guarantees are reproducible.

### Core iterator — `packages/core/test/utilities/obliqueIntegerIterator.jest.js`

- **Basis invariants** — for a spread of normals (axis-aligned, `[1,1,0]`,
  `[1,2,3]`, `[3,-4,12]`, …): integer entries, `N·A = 0`, `N·B = 0`, `N·C = 1`,
  `|det([A B C])| = 1`.
- **Bijection** — on 5³ volumes, `ijk → uvw → ijk` round-trips and every voxel
  maps to a unique `(u, v, w)`.
- **Disjoint planes** — on a 6³ volume with `N = [1,2,3]`, any two distinct `w`
  planes share no voxel.
- **Full coverage** — on 7×9×5, 8³, 9³ and an anisotropic-spacing 10×8×6 volume
  (axis-aligned, 45° `y/z`, diagonal `[1,1,1]`, `[0,1,1]`), iterating the full
  `u, v, w` ranges visits every voxel exactly once.
- **Line clipping** — `clipIntegerLineToBox` returns exact ranges for positive,
  negative and zero step components on a 10³ box.
- **Ellipsoid ranges** — on 25³ volumes (axis-aligned, diagonal `[1,1,1]`, and
  anisotropic spacing `[1,1,2]`), the analytic nested ranges enumerate exactly
  the same voxels as a brute-force world-distance sphere.
- **Normal error bound** — a `~2.86°` oblique covector keeps the coarse
  `[1,0,0]` normal on a small volume (extent 10) but forces a strictly finer
  normal on a large volume (extent 400) so the edge drift stays within one voxel
  diagonal; `createObliqueIntegerBasis` honours the bound on a 256×256×64 volume
  while remaining unimodular.
- **Area from voxel count** — on identity/isotropic volumes with normals
  `[0,0,1]`, `[0,3,4]`, `[1,1,1]`, `[1,2,2]`, `count · cellArea → πr²` with < 1%
  error at `r = 160` and radius-averaged error shrinking as `r` grows (no
  obliquity bias), plus an `O(r)` absolute-error bound at `r = 120`.

### Brush integration — `packages/tools/src/tools/segmentation/strategies/__tests__/obliqueIntegerFill.spec.ts`

- **Circle (oblique, 21³)** — a planar circle fill duplicates no voxels between
  adjacent `w` planes and stays far smaller than the full bounding box.
- **Sphere (oblique, 25³)** — the fill is deterministic and voxel-unique for an
  oblique viewport.
- **Rectangle (rotated, 30³)** — the fill is deterministic for a rotated view
  (identical basis and voxel set across repeated builds).

### Rectangle corners — `packages/tools/src/tools/segmentation/strategies/__tests__/fillRectangle.spec.ts`

- Corner ordering produces a proper (non-self-intersecting) winding for axial,
  coronal and oblique rectangles, and reconstructs the same rectangle when the
  plane is viewed from the opposite normal.

## Constraints and assumptions

- **Orthonormal direction matrix** — the world ↔ index mapping assumes the
  volume's direction vectors are orthonormal (the standard Cornerstone
  assumption). Sheared grids are not supported.
- **Integer ownership only** — this iterator is for segmentation voxel ownership
  and fast traversal. It is _not_ a replacement for the continuous / fractional
  oblique geometry used for display position or interpolation; keep those
  concepts separate.
- **Rectangle still uses a final predicate** — its range clipping is
  conservative, so a minimal world-space inclusion test remains. It is
  structured so the predicate can be tightened or removed later.
