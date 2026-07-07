import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { Point3 } from '../types';

/**
 * Integer oblique voxel iterator.
 *
 * This module provides a fast, deterministic way to enumerate the voxels that
 * belong to an oblique plane (or a stack of parallel oblique planes) of a
 * volume, using an *integer* lattice basis rather than fractional world/index
 * sampling followed by rounding.
 *
 * The key idea: given a primitive integer plane normal `N = [ni, nj, nk]`
 * (`gcd(ni, nj, nk) === 1`), we build three integer step vectors `A`, `B`, `C`
 * such that
 *
 * ```
 *   N · A === 0
 *   N · B === 0
 *   N · C === 1
 *   |det([A B C])| === 1   // unimodular
 * ```
 *
 * Because `[A B C]` is a unimodular integer basis, the map
 *
 * ```
 *   ijk = origin + u * A + v * B + w * C
 * ```
 *
 * is a bijection between integer `(u, v, w)` and integer `ijk`. Consequently:
 *
 * - Every integer voxel belongs to exactly one integer `w` plane.
 * - Adjacent planes `w`, `w ± 1` are disjoint (they never share a voxel).
 * - No voxel is visited twice when iterating a `(u, v, w)` box.
 *
 * This is intended for oblique plane area and volume *voxel ownership* iteration
 * such as that used in segmentation or display/calculations of area annotations.
 * This is deliberately separate from the continuous/fractional oblique geometry used to
 * define the actual brush shape, display position, or interpolation.
 */

/** Inclusive integer range `[min, max]`. `min > max` denotes an empty range. */
export interface IntRange {
  min: number;
  max: number;
}

/**
 * A unimodular integer basis describing an oblique plane family of a volume.
 */
export interface ObliqueIntegerBasis {
  /** Primitive integer plane covector `N`. */
  normal: Point3;
  /** Integer `u` step (in-plane). */
  A: Point3;
  /** Integer `v` step (in-plane). */
  B: Point3;
  /** Integer `w` step (out-of-plane, one plane per unit `w`). */
  C: Point3;
  /** Integer origin offset, usually `[0, 0, 0]`. */
  origin: Point3;
  /** Global `u` range spanning the volume bounds. */
  uRange: IntRange;
  /** Global `v` range spanning the volume bounds. */
  vRange: IntRange;
  /** Global `w` range spanning the volume bounds. */
  wRange: IntRange;
}

const EPSILON = 1e-9;

/** Greatest common divisor of two integers (always `>= 0`). */
export function gcd2(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/** Greatest common divisor of three integers (always `>= 0`). */
export function gcd3(a: number, b: number, c: number): number {
  return gcd2(gcd2(a, b), c);
}

/**
 * Extended Euclidean algorithm. Returns `{ g, x, y }` with
 * `a * x + b * y === g` and `g === gcd(|a|, |b|) >= 0`.
 */
export function extendedGcd(
  a: number,
  b: number
): { g: number; x: number; y: number } {
  a = Math.trunc(a);
  b = Math.trunc(b);
  const signA = a < 0 ? -1 : 1;
  const signB = b < 0 ? -1 : 1;

  let oldR = Math.abs(a);
  let r = Math.abs(b);
  let oldS = 1;
  let s = 0;
  let oldT = 0;
  let t = 1;

  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }

  // |a| * oldS + |b| * oldT === oldR (=== gcd). Fold the input signs back in so
  // the identity holds for the signed inputs.
  return { g: oldR, x: signA * oldS, y: signB * oldT };
}

/**
 * Reduces an integer vector to its primitive form by dividing out the gcd of
 * its components. A zero vector is returned unchanged. The component signs are
 * preserved (use {@link canonicalizeSign} to normalize orientation).
 */
export function makePrimitive(v: Point3): Point3 {
  const g = gcd3(v[0], v[1], v[2]);
  if (g === 0) {
    return [0, 0, 0];
  }
  return [
    Math.trunc(v[0]) / g,
    Math.trunc(v[1]) / g,
    Math.trunc(v[2]) / g,
  ] as Point3;
}

/**
 * Flips the sign of an integer vector so that its first non-zero component is
 * positive. This makes the chosen normal deterministic regardless of the
 * incoming orientation.
 */
export function canonicalizeSign(v: Point3): Point3 {
  for (let i = 0; i < 3; i++) {
    if (v[i] > 0) {
      return [v[0], v[1], v[2]] as Point3;
    }
    if (v[i] < 0) {
      // `+ 0` normalizes any `-0` produced by negating a zero component.
      return [-v[0] + 0, -v[1] + 0, -v[2] + 0] as Point3;
    }
  }
  return [0, 0, 0];
}

function dot3(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Point3, b: Point3): Point3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ] as Point3;
}

function add3(a: Point3, b: Point3): Point3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as Point3;
}

function negate3(a: Point3): Point3 {
  // `+ 0` normalizes any `-0` produced by negating a zero component.
  return [-a[0] + 0, -a[1] + 0, -a[2] + 0] as Point3;
}

/**
 * Adds two integer `Point3` step vectors. Exposed for hot inner loops that
 * advance `ijk += B`.
 */
export function addPoint3(a: Point3, b: Point3): Point3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as Point3;
}

/**
 * The signed determinant of the matrix whose columns are `A`, `B`, `C`. For a
 * valid oblique basis this is `+1` or `-1`.
 */
export function detColumns(A: Point3, B: Point3, C: Point3): number {
  return dot3(A, cross3(B, C));
}

/**
 * Converts a *world-space* plane normal to an *index-space* covector.
 *
 * With `world = origin + M * ijk`, the plane `n · (world - p0) = 0` becomes, in
 * index space, `g · (ijk - ijk0) = 0` with `g = transpose(M) * n`. The columns
 * of `M` are the (unit) direction vectors scaled by voxel spacing, so
 * `g[axis] = spacing[axis] * (directionAxis · n)`.
 *
 * @param direction - Row-major volume direction matrix `[ix,iy,iz, jx,..]`.
 * @param spacing - Per-axis voxel spacing.
 * @param worldNormal - Plane normal in world space.
 * @returns The (unnormalized) index-space covector `g`.
 */
export function indexNormalCovectorFromWorld(
  direction: mat3 | number[],
  spacing: Point3,
  worldNormal: Point3
): Point3 {
  const iVec = direction.slice(0, 3) as Point3;
  const jVec = direction.slice(3, 6) as Point3;
  const kVec = direction.slice(6, 9) as Point3;
  return [
    spacing[0] * dot3(iVec, worldNormal),
    spacing[1] * dot3(jVec, worldNormal),
    spacing[2] * dot3(kVec, worldNormal),
  ] as Point3;
}

/**
 * Chooses a primitive integer normal `N` that best approximates the direction
 * of a floating/index-space covector `g`.
 *
 * The candidate is found by scaling `g` so its largest-magnitude component maps
 * to each denominator `d` in `1..maxDenominator`, rounding to integers, and
 * keeping the primitive vector whose direction is closest to `g` (largest
 * `|cos angle|`). The result is sign-canonicalized for determinism.
 *
 * @param N - An integer normal.
 * @param g - The target floating covector.
 * @returns `sin(theta)` where `theta` is the angle between `N` and `g`, in
 * `[0, 1]`. `0` means perfectly aligned.
 */
export function integerNormalAngularSin(N: Point3, g: Point3): number {
  const nLen = Math.sqrt(dot3(N, N));
  const gLen = Math.sqrt(dot3(g, g));
  if (nLen < EPSILON || gLen < EPSILON) {
    return 0;
  }
  const c = cross3(N, g);
  const cLen = Math.sqrt(dot3(c, c));
  // Clamp against tiny numerical overshoot beyond 1.
  return Math.min(1, cLen / (nLen * gLen));
}

/**
 * Estimates how far apart the *edge* voxels of a single integer oblique plane
 * drift, measured along the true normal, when an integer normal `N` is used to
 * approximate the true covector `g` over a volume of the given in-plane extent.
 *
 * A voxel on the integer plane `N·ijk = w` is displaced in-plane by up to
 * `volumeExtent` (index units). Its coordinate along the true unit normal drifts
 * by `sin(theta) · displacement`, so the edge-to-edge drift is
 * `volumeExtent · sin(theta)`. Bounding this keeps the integer plane hugging the
 * true plane (no slice leakage) and is the accuracy requirement the normal must
 * satisfy.
 *
 * @param N - Candidate integer normal.
 * @param g - True index-space covector.
 * @param volumeExtent - In-plane diameter of the volume, in index/voxel units.
 * @returns The edge drift along the true normal, in index/voxel units.
 */
export function obliquePlaneEdgeDrift(
  N: Point3,
  g: Point3,
  volumeExtent: number
): number {
  return volumeExtent * integerNormalAngularSin(N, g);
}

/**
 * Options controlling how {@link choosePrimitiveIntegerNormal} selects the
 * integer normal.
 */
export interface ChooseIntegerNormalOptions {
  /** Largest denominator to try (default `64`, raised automatically when a
   * drift bound requires finer resolution). */
  maxDenominator?: number;
  /**
   * In-plane extent (diameter) of the volume, in index/voxel units. When
   * provided, the chosen normal must keep the oblique-plane edge drift
   * (see {@link obliquePlaneEdgeDrift}) within `maxNormalDrift`.
   */
  volumeExtent?: number;
  /**
   * Maximum permitted edge-voxel drift along the true normal for one integer
   * plane, in index/voxel units. Defaults to one voxel diagonal (`sqrt(3)`),
   * i.e. the edge voxels of an oblique plane are never further apart than one
   * diagonal voxel distance in the direction of the normal.
   */
  maxNormalDrift?: number;
}

/** Hard cap on the denominator search so a tiny drift budget cannot blow up. */
const MAX_DENOMINATOR_CAP = 1 << 16;

/**
 * Chooses a primitive integer normal `N` that approximates the direction of a
 * floating/index-space covector `g`.
 *
 * Two selection modes:
 *
 * - **Drift-bounded** (when `volumeExtent` is provided): returns the *simplest*
 *   (coarsest) primitive normal whose oblique-plane edge drift is within
 *   `maxNormalDrift` (default one voxel diagonal). The denominator search grows
 *   with the volume, so larger volumes get proportionally more accurate normals
 *   — guaranteeing the edge voxels of a plane never separate by more than one
 *   diagonal voxel distance along the normal. If no candidate meets the bound
 *   within the search cap, the most accurate candidate found is returned.
 * - **Best-effort** (no `volumeExtent`): returns the candidate with the smallest
 *   angular error over `1..maxDenominator`.
 *
 * Candidates are generated by scaling `g` so its largest-magnitude component
 * maps to each denominator `d`, rounding to integers and reducing to primitive
 * form. The result is sign-canonicalized for determinism.
 *
 * @param g - A non-zero floating covector (e.g. from
 * {@link indexNormalCovectorFromWorld}).
 * @param optionsOrMaxDenominator - Selection options, or a number treated as
 * `maxDenominator` for backward compatibility.
 */
export function choosePrimitiveIntegerNormal(
  g: Point3,
  optionsOrMaxDenominator: number | ChooseIntegerNormalOptions = 64
): Point3 {
  const options: ChooseIntegerNormalOptions =
    typeof optionsOrMaxDenominator === 'number'
      ? { maxDenominator: optionsOrMaxDenominator }
      : optionsOrMaxDenominator;

  const { volumeExtent, maxNormalDrift = Math.sqrt(3) } = options;

  const hasDriftBound =
    typeof volumeExtent === 'number' &&
    volumeExtent > 0 &&
    Number.isFinite(maxNormalDrift) &&
    maxNormalDrift > 0;

  // The bound on sin(theta): drift = volumeExtent * sin(theta) <= maxNormalDrift.
  const sinThreshold = hasDriftBound
    ? maxNormalDrift / volumeExtent
    : Number.POSITIVE_INFINITY;

  let maxDenominator = options.maxDenominator ?? 64;
  if (hasDriftBound) {
    // Resolving an angle of ~sinThreshold needs denominators up to ~1/sinThreshold.
    const needed = Math.ceil(1 / sinThreshold) + 1;
    maxDenominator = Math.min(
      Math.max(maxDenominator, needed),
      MAX_DENOMINATOR_CAP
    );
  }

  const absG = [Math.abs(g[0]), Math.abs(g[1]), Math.abs(g[2])];
  const gMax = Math.max(absG[0], absG[1], absG[2]);
  if (gMax < EPSILON) {
    throw new Error(
      'choosePrimitiveIntegerNormal: the input covector is (near) zero'
    );
  }

  let best: Point3 | null = null;
  let bestErr = Number.POSITIVE_INFINITY;

  for (let d = 1; d <= maxDenominator; d++) {
    const scale = d / gMax;
    const cand = [
      Math.round(g[0] * scale),
      Math.round(g[1] * scale),
      Math.round(g[2] * scale),
    ] as Point3;

    if (cand[0] === 0 && cand[1] === 0 && cand[2] === 0) {
      continue;
    }

    const prim = makePrimitive(cand);
    const sinTheta = integerNormalAngularSin(prim, g);

    if (sinTheta < bestErr - EPSILON) {
      bestErr = sinTheta;
      best = prim;
    }

    if (hasDriftBound) {
      // Ascending `d` yields increasingly complex candidates, so the first one
      // within the drift budget is the simplest normal that satisfies it.
      if (sinTheta <= sinThreshold + EPSILON) {
        return canonicalizeSign(prim);
      }
    } else if (sinTheta < EPSILON) {
      // Exact match; nothing simpler will do better.
      break;
    }
  }

  if (!best) {
    throw new Error(
      'choosePrimitiveIntegerNormal: failed to find an integer normal'
    );
  }

  return canonicalizeSign(best);
}

/**
 * Builds a unimodular integer basis `[A B C]` from a primitive integer normal
 * `N`, satisfying `N·A = 0`, `N·B = 0`, `N·C = 1`, `det([A B C]) = ±1`.
 *
 * The construction uses two extended-gcd (Bézout) steps:
 *
 * 1. `d = gcd(b, c)` with `b·y0 + c·z0 = d`.
 * 2. `a·s + d·t = gcd(a, d) = 1` (equals 1 because `N` is primitive).
 *
 * from which
 *
 * ```
 *   A = (0, c/d, -b/d)              // in-plane, N·A = 0
 *   B = (-d, a·y0, a·z0)            // in-plane, N·B = 0
 *   C = (s, t·y0, t·z0)             // N·C = a·s + t·d = 1
 * ```
 *
 * yields `det([A B C]) = a·s + d·t = 1`. The degenerate axis-aligned case
 * (`b = c = 0`, so `N = (±1, 0, 0)`) is handled explicitly.
 *
 * @param normal - A primitive integer normal (`gcd === 1`).
 */
export function buildIntegerBasisFromNormal(normal: Point3): {
  A: Point3;
  B: Point3;
  C: Point3;
} {
  const a = Math.trunc(normal[0]);
  const b = Math.trunc(normal[1]);
  const c = Math.trunc(normal[2]);

  if (a === 0 && b === 0 && c === 0) {
    throw new Error('buildIntegerBasisFromNormal: normal must be non-zero');
  }

  const g = gcd3(a, b, c);
  if (g !== 1) {
    throw new Error(
      `buildIntegerBasisFromNormal: normal must be primitive (gcd === 1), got gcd === ${g}`
    );
  }

  // Degenerate case: normal is (±1, 0, 0). gcd(b, c) === 0.
  if (b === 0 && c === 0) {
    // a is ±1. C.x must satisfy a * C.x === 1 -> C.x === a (since 1/±1 === ±1).
    return {
      A: [0, 1, 0] as Point3,
      B: [0, 0, 1] as Point3,
      C: [a, 0, 0] as Point3,
    };
  }

  const { g: d, x: y0, y: z0 } = extendedGcd(b, c); // b*y0 + c*z0 === d
  const bd = b / d;
  const cd = c / d;

  const { x: s, y: t } = extendedGcd(a, d); // a*s + d*t === gcd(a, d) === 1

  const A: Point3 = [0, cd, -bd];
  const B: Point3 = [-d, a * y0, a * z0];
  const C: Point3 = [s, t * y0, t * z0];

  return { A, B, C };
}

/**
 * Applies a row-major `3x3` matrix (as a flat 9-array or `mat3`) to an integer
 * `Point3`, returning the transformed (floating) vector. Used to compare
 * integer step vectors against world-space view axes.
 */
function applyMatrix3(m: mat3 | number[], v: Point3): Point3 {
  const iVec = m.slice(0, 3) as Point3;
  const jVec = m.slice(3, 6) as Point3;
  const kVec = m.slice(6, 9) as Point3;
  return [
    iVec[0] * v[0] + jVec[0] * v[1] + kVec[0] * v[2],
    iVec[1] * v[0] + jVec[1] * v[1] + kVec[1] * v[2],
    iVec[2] * v[0] + jVec[2] * v[1] + kVec[2] * v[2],
  ] as Point3;
}

/**
 * Reorients the (mathematically arbitrary) in-plane axes `A`, `B` so `A` tracks
 * the viewport `viewRight` and `B` tracks `viewUp` as closely as possible,
 * making iteration order stable and deterministic.
 *
 * Only unimodular-preserving operations are used: `A`/`B` may be swapped and
 * either may be sign-flipped. `C` is left untouched, so `N·A = N·B = 0` and
 * `N·C = 1` are preserved and `|det|` stays `1`.
 *
 * If a voxel-to-world matrix `M` is supplied, the integer steps are compared in
 * world space (`M·A`, `M·B`) rather than raw index space.
 *
 * @param A - In-plane `u` step.
 * @param B - In-plane `v` step.
 * @param viewRight - World-space right axis (may be omitted).
 * @param viewUp - World-space up axis.
 * @param voxelToWorld - Optional voxel-to-world `3x3` matrix.
 */
export function orientBasisToViewUp(
  A: Point3,
  B: Point3,
  viewRight: Point3 | undefined,
  viewUp: Point3,
  voxelToWorld?: mat3 | number[]
): { A: Point3; B: Point3 } {
  const worldA = voxelToWorld ? applyMatrix3(voxelToWorld, A) : A;
  const worldB = voxelToWorld ? applyMatrix3(voxelToWorld, B) : B;

  const normalize = (v: Point3): Point3 => {
    const len = Math.sqrt(dot3(v, v));
    return len < EPSILON
      ? [0, 0, 0]
      : ([v[0] / len, v[1] / len, v[2] / len] as Point3);
  };

  const nWorldA = normalize(worldA);
  const nWorldB = normalize(worldB);
  const up = normalize(viewUp);
  // Fall back to viewUp for right when a right axis is not provided; the
  // assignment still separates the two axes meaningfully via the up dot.
  const right = viewRight ? normalize(viewRight) : up;

  // Prefer the assignment (A->right, B->up) that maximizes total alignment.
  const scoreKeep =
    Math.abs(dot3(nWorldA, right)) + Math.abs(dot3(nWorldB, up));
  const scoreSwap =
    Math.abs(dot3(nWorldB, right)) + Math.abs(dot3(nWorldA, up));

  let outA = A;
  let outB = B;
  let outWorldA = nWorldA;
  let outWorldB = nWorldB;

  if (scoreSwap > scoreKeep) {
    outA = B;
    outB = A;
    outWorldA = nWorldB;
    outWorldB = nWorldA;
  }

  if (dot3(outWorldA, right) < 0) {
    outA = negate3(outA);
  }
  if (dot3(outWorldB, up) < 0) {
    outB = negate3(outB);
  }

  return { A: outA, B: outB };
}

/**
 * Maps integer `(u, v, w)` to `ijk`: `ijk = origin + u·A + v·B + w·C`.
 */
export function ijkFromUVW(
  u: number,
  v: number,
  w: number,
  basis: Pick<ObliqueIntegerBasis, 'A' | 'B' | 'C' | 'origin'>
): Point3 {
  const { A, B, C, origin } = basis;
  return [
    origin[0] + u * A[0] + v * B[0] + w * C[0],
    origin[1] + u * A[1] + v * B[1] + w * C[1],
    origin[2] + u * A[2] + v * B[2] + w * C[2],
  ] as Point3;
}

/**
 * Maps integer `ijk` back to `(u, v, w)`. Because `[A B C]` is unimodular its
 * inverse is integer; the rows of the inverse are the cross products of the
 * columns divided by the determinant.
 */
export function uvwFromIJK(
  ijk: Point3,
  basis: Pick<ObliqueIntegerBasis, 'A' | 'B' | 'C' | 'origin'>
): Point3 {
  const { A, B, C, origin } = basis;
  const det = detColumns(A, B, C);
  if (det === 0) {
    throw new Error('uvwFromIJK: basis is singular');
  }
  const rel: Point3 = [
    ijk[0] - origin[0],
    ijk[1] - origin[1],
    ijk[2] - origin[2],
  ];
  const rowU = cross3(B, C);
  const rowV = cross3(C, A);
  const rowW = cross3(A, B);
  return [
    dot3(rowU, rel) / det,
    dot3(rowV, rel) / det,
    dot3(rowW, rel) / det,
  ] as Point3;
}

/** Intersects two inclusive integer ranges. */
export function intersectRange(a: IntRange, b: IntRange): IntRange {
  return { min: Math.max(a.min, b.min), max: Math.min(a.max, b.max) };
}

/** Whether an inclusive integer range is non-empty. */
export function isRangeEmpty(range: IntRange): boolean {
  return range.min > range.max;
}

/**
 * Computes the global `(u, v, w)` ranges that cover a volume's voxel bounds
 * `[0, width-1] x [0, height-1] x [0, depth-1]` for the given basis, by
 * transforming the 8 corners and taking the integer envelope.
 */
export function computeUVWRangesFromBounds(
  basis: Pick<ObliqueIntegerBasis, 'A' | 'B' | 'C' | 'origin'>,
  width: number,
  height: number,
  depth: number
): { uRange: IntRange; vRange: IntRange; wRange: IntRange } {
  const uMinMax = { min: Infinity, max: -Infinity };
  const vMinMax = { min: Infinity, max: -Infinity };
  const wMinMax = { min: Infinity, max: -Infinity };

  for (let ci = 0; ci < 8; ci++) {
    const corner: Point3 = [
      ci & 1 ? width - 1 : 0,
      ci & 2 ? height - 1 : 0,
      ci & 4 ? depth - 1 : 0,
    ];
    const [u, v, w] = uvwFromIJK(corner, basis);
    uMinMax.min = Math.min(uMinMax.min, u);
    uMinMax.max = Math.max(uMinMax.max, u);
    vMinMax.min = Math.min(vMinMax.min, v);
    vMinMax.max = Math.max(vMinMax.max, v);
    wMinMax.min = Math.min(wMinMax.min, w);
    wMinMax.max = Math.max(wMinMax.max, w);
  }

  return {
    uRange: { min: Math.floor(uMinMax.min), max: Math.ceil(uMinMax.max) },
    vRange: { min: Math.floor(vMinMax.min), max: Math.ceil(vMinMax.max) },
    wRange: { min: Math.floor(wMinMax.min), max: Math.ceil(wMinMax.max) },
  };
}

/**
 * Clips an integer parametric line `p(t) = base + t·step` (all integer
 * `Point3`s) against the voxel box `0 <= i < width`, `0 <= j < height`,
 * `0 <= k < depth`, intersecting with an initial `t` range.
 *
 * Returns the exact inclusive integer `t` range for which `p(t)` is in bounds.
 * When a `step` component is `0`, the corresponding coordinate must already be
 * in range or the result is empty. This lets the innermost fill loop drop the
 * per-voxel bounds test.
 */
export function clipIntegerLineToBox(
  initial: IntRange,
  base: Point3,
  step: Point3,
  width: number,
  height: number,
  depth: number
): IntRange {
  const dims = [width, height, depth];
  let min = initial.min;
  let max = initial.max;

  for (let axis = 0; axis < 3; axis++) {
    const s = step[axis];
    const b = base[axis];
    const hi = dims[axis] - 1;

    if (s === 0) {
      if (b < 0 || b > hi) {
        return { min: 1, max: 0 };
      }
      continue;
    }

    // b + t*s in [0, hi]
    const t1 = (0 - b) / s;
    const t2 = (hi - b) / s;
    const lo = Math.ceil(Math.min(t1, t2));
    const up = Math.floor(Math.max(t1, t2));
    if (lo > min) {
      min = lo;
    }
    if (up < max) {
      max = up;
    }
  }

  // `+ 0` normalizes any `-0` produced by ceil/floor of negative fractions.
  return { min: min + 0, max: max + 0 };
}

/* -------------------------------------------------------------------------- */
/* Ellipsoid range clipping (exact nested integer ranges in u, v, w space).   */
/* -------------------------------------------------------------------------- */

/**
 * An ellipsoid expressed in `(u, v, w)` lattice coordinates as
 * `(q - q0)^T H (q - q0) <= 1`, with `H` a symmetric positive-definite `3x3`
 * matrix (row-major flat 9-array) and `q0` the center in `(u, v, w)`.
 */
export interface ObliqueEllipsoidUVW {
  /** Symmetric `3x3` quadratic form in `(u, v, w)`, row-major. */
  H: number[];
  /** Center in `(u, v, w)`. */
  q0: Point3;
}

function symIndex(row: number, col: number): number {
  return row * 3 + col;
}

/**
 * Transforms an index-space ellipsoid `(p - center)^T Q (p - center) <= 1`
 * into `(u, v, w)` coordinates for the given basis.
 *
 * With `p = origin + L·q`, `L = [A B C]`:
 *
 * ```
 *   H  = transpose(L) · Q · L
 *   q0 = inverse(L) · (center - origin)
 * ```
 *
 * @param Q - Symmetric index-space quadratic form, row-major flat 9-array.
 * @param centerIJK - Ellipsoid center in index space.
 * @param basis - The oblique integer basis.
 */
export function ellipsoidUVWFromIndexQuadratic(
  Q: number[],
  centerIJK: Point3,
  basis: Pick<ObliqueIntegerBasis, 'A' | 'B' | 'C' | 'origin'>
): ObliqueEllipsoidUVW {
  const cols = [basis.A, basis.B, basis.C];

  // H = L^T Q L. Column j of (Q L) is Q * cols[j].
  const QL: Point3[] = cols.map((col) => {
    return [
      Q[0] * col[0] + Q[1] * col[1] + Q[2] * col[2],
      Q[3] * col[0] + Q[4] * col[1] + Q[5] * col[2],
      Q[6] * col[0] + Q[7] * col[1] + Q[8] * col[2],
    ] as Point3;
  });

  const H = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      H[symIndex(r, c)] = dot3(cols[r], QL[c]);
    }
  }

  const q0 = uvwFromIJK(centerIJK, basis);

  return { H, q0 };
}

/** Builds an index-space quadratic form `Q = (transpose(M)·M) / r^2` for a
 * world-space sphere of radius `r`, where `M` is the voxel-to-world matrix
 * (direction scaled by spacing). The resulting ellipsoid, expressed in index
 * space, corresponds to `|world - center| <= r`. */
export function sphereIndexQuadratic(
  direction: mat3 | number[],
  spacing: Point3,
  radius: number
): number[] {
  // M columns are direction axes * spacing.
  const m: Point3[] = [
    [
      (direction[0] as number) * spacing[0],
      (direction[1] as number) * spacing[0],
      (direction[2] as number) * spacing[0],
    ],
    [
      (direction[3] as number) * spacing[1],
      (direction[4] as number) * spacing[1],
      (direction[5] as number) * spacing[1],
    ],
    [
      (direction[6] as number) * spacing[2],
      (direction[7] as number) * spacing[2],
      (direction[8] as number) * spacing[2],
    ],
  ];
  const invR2 = 1 / (radius * radius);
  const Q = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // (M^T M)[r][c] = column r . column c
      Q[symIndex(r, c)] = dot3(m[r], m[c]) * invR2;
    }
  }
  return Q;
}

function invert3(m: number[]): number[] {
  const a = m[0];
  const b = m[1];
  const c = m[2];
  const d = m[3];
  const e = m[4];
  const f = m[5];
  const g = m[6];
  const h = m[7];
  const i = m[8];

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < EPSILON) {
    throw new Error('invert3: matrix is singular');
  }
  const invDet = 1 / det;

  return [
    A * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    B * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    C * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

/**
 * The `w` range of the ellipsoid: `q0.w ± sqrt((H^{-1})_{ww})`, rounded
 * inward/outward to integers.
 */
export function getWRangeForUVWEllipsoid(
  ellipsoid: ObliqueEllipsoidUVW
): IntRange {
  const Hinv = invert3(ellipsoid.H);
  const wwVar = Hinv[symIndex(2, 2)];
  if (wwVar <= 0) {
    return { min: 1, max: 0 };
  }
  const wRadius = Math.sqrt(wwVar);
  const wc = ellipsoid.q0[2];
  return { min: Math.ceil(wc - wRadius), max: Math.floor(wc + wRadius) };
}

/**
 * The `u` range of the ellipsoid at a fixed integer `w` (marginalized over
 * `v`). Solves `min_v (q - q0)^T H (q - q0) <= 1` for `u`.
 */
export function getURangeForW(
  ellipsoid: ObliqueEllipsoidUVW,
  w: number
): IntRange {
  const { H, q0 } = ellipsoid;
  const H00 = H[symIndex(0, 0)];
  const H01 = H[symIndex(0, 1)];
  const H02 = H[symIndex(0, 2)];
  const H11 = H[symIndex(1, 1)];
  const H12 = H[symIndex(1, 2)];
  const H22 = H[symIndex(2, 2)];

  const rw = w - q0[2];

  if (Math.abs(H11) < EPSILON) {
    return { min: 1, max: 0 };
  }

  // After eliminating v (setting d/dv = 0): a*ru^2 + b*ru + cc <= 0.
  const a = H00 - (H01 * H01) / H11;
  const b = 2 * (H02 - (H01 * H12) / H11) * rw;
  const cc = (H22 - (H12 * H12) / H11) * rw * rw - 1;

  if (Math.abs(a) < EPSILON) {
    return { min: 1, max: 0 };
  }

  const disc = b * b - 4 * a * cc;
  if (disc < 0) {
    return { min: 1, max: 0 };
  }
  const sqrtDisc = Math.sqrt(disc);
  const ruLo = (-b - sqrtDisc) / (2 * a);
  const ruHi = (-b + sqrtDisc) / (2 * a);
  const uc = q0[0];
  return {
    min: Math.ceil(uc + Math.min(ruLo, ruHi)),
    max: Math.floor(uc + Math.max(ruLo, ruHi)),
  };
}

/**
 * The `v` range of the ellipsoid at fixed integer `w` and `u`. Solves the
 * remaining `1D` quadratic in `v`.
 */
export function getVRangeForWU(
  ellipsoid: ObliqueEllipsoidUVW,
  w: number,
  u: number
): IntRange {
  const { H, q0 } = ellipsoid;
  const H00 = H[symIndex(0, 0)];
  const H01 = H[symIndex(0, 1)];
  const H02 = H[symIndex(0, 2)];
  const H11 = H[symIndex(1, 1)];
  const H12 = H[symIndex(1, 2)];
  const H22 = H[symIndex(2, 2)];

  const ru = u - q0[0];
  const rw = w - q0[2];

  if (Math.abs(H11) < EPSILON) {
    return { min: 1, max: 0 };
  }

  // H11*rv^2 + 2*Bv*rv + (Cv - 1) <= 0
  const Bv = H01 * ru + H12 * rw;
  const Cv = H00 * ru * ru + 2 * H02 * ru * rw + H22 * rw * rw;

  const disc = Bv * Bv - H11 * (Cv - 1);
  if (disc < 0) {
    return { min: 1, max: 0 };
  }
  const sqrtDisc = Math.sqrt(disc);
  const rvLo = (-Bv - sqrtDisc) / H11;
  const rvHi = (-Bv + sqrtDisc) / H11;
  const vc = q0[1];
  return {
    min: Math.ceil(vc + Math.min(rvLo, rvHi)),
    max: Math.floor(vc + Math.max(rvLo, rvHi)),
  };
}

/* -------------------------------------------------------------------------- */
/* High-level basis construction and iteration.                               */
/* -------------------------------------------------------------------------- */

export interface CreateObliqueIntegerBasisOptions {
  /** Volume voxel dimensions. */
  dimensions: Point3;
  /** Volume direction matrix (row-major flat 9-array), orthonormal. */
  direction: mat3 | number[];
  /** Volume voxel spacing. */
  spacing: Point3;
  /** View plane normal in world space. */
  viewPlaneNormal: Point3;
  /** View up axis in world space (for deterministic in-plane orientation). */
  viewUp: Point3;
  /** Optional view right axis in world space. */
  viewRight?: Point3;
  /** Largest denominator to try when approximating the integer normal. */
  maxDenominator?: number;
  /**
   * Maximum permitted edge-voxel drift of a single integer plane along the true
   * normal, in index/voxel units. Defaults to one voxel diagonal (`sqrt(3)`),
   * so the edge voxels of an oblique plane are never further apart than one
   * diagonal voxel distance in the direction of the normal. The volume's
   * in-plane extent is derived from `dimensions`, so larger volumes
   * automatically require a more accurate integer normal.
   */
  maxNormalDrift?: number;
  /** Integer origin offset (defaults to `[0, 0, 0]`). */
  origin?: Point3;
}

/**
 * Builds a full {@link ObliqueIntegerBasis} for a volume from a world-space
 * view plane normal / view up, including the global `(u, v, w)` ranges spanning
 * the volume. This is the main entry point used by segmentation fills.
 */
export function createObliqueIntegerBasis(
  options: CreateObliqueIntegerBasisOptions
): ObliqueIntegerBasis {
  const {
    dimensions,
    direction,
    spacing,
    viewPlaneNormal,
    viewUp,
    viewRight,
    maxDenominator,
    maxNormalDrift = Math.sqrt(3),
    origin = [0, 0, 0] as Point3,
  } = options;

  const g = indexNormalCovectorFromWorld(direction, spacing, viewPlaneNormal);

  // In-plane extent (index units): the volume space diagonal is a conservative
  // upper bound on the in-plane diameter, so the drift bound is never violated.
  const volumeExtent = Math.hypot(
    dimensions[0] - 1,
    dimensions[1] - 1,
    dimensions[2] - 1
  );

  const normal = choosePrimitiveIntegerNormal(g, {
    maxDenominator,
    volumeExtent,
    maxNormalDrift,
  });
  const raw = buildIntegerBasisFromNormal(normal);

  // Voxel-to-world matrix M (columns = direction axes * spacing), row-major.
  const iVec = direction.slice(0, 3) as Point3;
  const jVec = direction.slice(3, 6) as Point3;
  const kVec = direction.slice(6, 9) as Point3;
  const M: number[] = [
    iVec[0] * spacing[0],
    jVec[0] * spacing[1],
    kVec[0] * spacing[2],
    iVec[1] * spacing[0],
    jVec[1] * spacing[1],
    kVec[1] * spacing[2],
    iVec[2] * spacing[0],
    jVec[2] * spacing[1],
    kVec[2] * spacing[2],
  ];

  let derivedRight = viewRight;
  if (!derivedRight) {
    // viewRight = viewUp x viewPlaneNormal
    derivedRight = cross3(viewUp, viewPlaneNormal);
  }

  const { A, B } = orientBasisToViewUp(raw.A, raw.B, derivedRight, viewUp, M);
  const C = raw.C;

  const ranges = computeUVWRangesFromBounds(
    { A, B, C, origin },
    dimensions[0],
    dimensions[1],
    dimensions[2]
  );

  return {
    normal,
    A,
    B,
    C,
    origin,
    uRange: ranges.uRange,
    vRange: ranges.vRange,
    wRange: ranges.wRange,
  };
}

export interface ObliqueVoxelVisit {
  ijk: Point3;
  u: number;
  v: number;
  w: number;
}

export interface ForEachObliqueVoxelOptions {
  /** Restrict to these `w` planes (intersected with the basis `wRange`). */
  wRange?: IntRange;
  /** Given `w`, return the candidate `u` range (defaults to the basis `uRange`). */
  getURangeForW?: (w: number) => IntRange;
  /** Given `w, u`, return the candidate `v` range (defaults to the basis `vRange`). */
  getVRangeForWU?: (w: number, u: number) => IntRange;
  /**
   * Volume dimensions used to clip the final `v` line to the voxel box. When
   * provided, in-bounds voxels are guaranteed and the visit callback need not
   * re-check bounds.
   */
  dimensions?: Point3;
  /**
   * Optional final inclusion predicate for shapes not expressed as exact
   * ranges. Kept minimal; can be removed once ranges are exact.
   */
  predicate?: (visit: ObliqueVoxelVisit) => boolean;
  /** Called once per owned, in-bounds voxel. */
  visit: (visit: ObliqueVoxelVisit) => void;
}

/**
 * Iterates the voxels owned by the oblique planes of `basis`, in
 * `w -> u -> v` order, advancing the innermost coordinate by `+= B` so the hot
 * loop avoids per-voxel matrix multiplication.
 *
 * The `v` line is clipped once against the volume box (when `dimensions` is
 * supplied) so the inner loop does not test bounds per voxel; when the caller's
 * `u`/`v`/`w` ranges already guarantee shape inclusion, no per-voxel predicate
 * is required either.
 */
export function forEachObliqueVoxel(
  basis: ObliqueIntegerBasis,
  options: ForEachObliqueVoxelOptions
): void {
  const { A, B, C, origin } = basis;
  const wRange = options.wRange
    ? intersectRange(basis.wRange, options.wRange)
    : basis.wRange;

  const uRangeFor = options.getURangeForW ?? (() => basis.uRange);
  const vRangeFor = options.getVRangeForWU ?? (() => basis.vRange);

  const dims = options.dimensions;
  const predicate = options.predicate;

  for (let w = wRange.min; w <= wRange.max; w++) {
    const uRange = intersectRange(basis.uRange, uRangeFor(w));
    for (let u = uRange.min; u <= uRange.max; u++) {
      let vRange = intersectRange(basis.vRange, vRangeFor(w, u));
      if (isRangeEmpty(vRange)) {
        continue;
      }

      // ijk at the start of the v line, then advance by += B.
      const base = ijkFromUVW(u, vRange.min, w, { A, B, C, origin });

      if (dims) {
        // Clip the v line to the voxel box so the inner loop needs no bounds
        // test. step === B; base already includes vRange.min.
        const relativeClip = clipIntegerLineToBox(
          { min: 0, max: vRange.max - vRange.min },
          base,
          B,
          dims[0],
          dims[1],
          dims[2]
        );
        if (isRangeEmpty(relativeClip)) {
          continue;
        }
        vRange = {
          min: vRange.min + relativeClip.min,
          max: vRange.min + relativeClip.max,
        };
      }

      let ijk = ijkFromUVW(u, vRange.min, w, { A, B, C, origin });
      for (let v = vRange.min; v <= vRange.max; v++) {
        if (!predicate || predicate({ ijk, u, v, w })) {
          options.visit({ ijk, u, v, w });
        }
        ijk = addPoint3(ijk, B);
      }
    }
  }
}
