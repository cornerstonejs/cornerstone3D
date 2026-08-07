import { describe, it, expect } from '@jest/globals';
import { obliqueIntegerIterator } from '../../src/utilities';

const {
  gcd2,
  gcd3,
  extendedGcd,
  makePrimitive,
  canonicalizeSign,
  choosePrimitiveIntegerNormal,
  indexNormalCovectorFromWorld,
  buildIntegerBasisFromNormal,
  orientBasisToViewUp,
  ijkFromUVW,
  uvwFromIJK,
  detColumns,
  intersectRange,
  isRangeEmpty,
  computeUVWRangesFromBounds,
  clipIntegerLineToBox,
  createObliqueIntegerBasis,
  forEachObliqueVoxel,
  ellipsoidUVWFromIndexQuadratic,
  sphereIndexQuadratic,
  getWRangeForUVWEllipsoid,
  getURangeForW,
  getVRangeForWU,
  integerNormalAngularSin,
  obliquePlaneEdgeDrift,
} = obliqueIntegerIterator;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A representative spread of primitive integer normals, including axis-aligned,
// simple obliques and larger obliques.
const NORMALS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
  [1, 2, 2],
  [2, 1, 2],
  [2, 2, 1],
  [1, 2, 3],
  [3, 2, 1],
  [2, 3, 6],
  [1, -1, 0],
  [-1, 2, -2],
  [3, -4, 12],
];

describe('obliqueIntegerIterator', () => {
  describe('gcd helpers', () => {
    it('gcd2 handles zeros, negatives and coprime inputs', () => {
      expect(gcd2(0, 0)).toBe(0);
      expect(gcd2(12, 0)).toBe(12);
      expect(gcd2(0, 9)).toBe(9);
      expect(gcd2(12, 18)).toBe(6);
      expect(gcd2(-12, 18)).toBe(6);
      expect(gcd2(7, 13)).toBe(1);
    });

    it('gcd3 reduces triples', () => {
      expect(gcd3(2, 4, 6)).toBe(2);
      expect(gcd3(3, 6, 9)).toBe(3);
      expect(gcd3(1, 2, 3)).toBe(1);
      expect(gcd3(0, 0, 5)).toBe(5);
    });

    it('extendedGcd satisfies a*x + b*y === g for signed inputs', () => {
      const cases = [
        [12, 18],
        [-12, 18],
        [12, -18],
        [7, 13],
        [0, 5],
        [5, 0],
        [-9, -6],
      ];
      for (const [a, b] of cases) {
        const { g, x, y } = extendedGcd(a, b);
        expect(g).toBe(gcd2(a, b));
        expect(a * x + b * y).toBe(g);
      }
    });
  });

  describe('primitive normalization', () => {
    it('reduces non-primitive vectors to primitive form', () => {
      expect(makePrimitive([2, 4, 6])).toEqual([1, 2, 3]);
      expect(makePrimitive([3, 6, 9])).toEqual([1, 2, 3]);
      expect(makePrimitive([0, 0, 5])).toEqual([0, 0, 1]);
      expect(makePrimitive([-2, -4, -6])).toEqual([-1, -2, -3]);
      // Already primitive stays unchanged.
      expect(makePrimitive([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('canonicalizeSign makes the first non-zero component positive', () => {
      expect(canonicalizeSign([-1, -2, -3])).toEqual([1, 2, 3]);
      expect(canonicalizeSign([0, -2, 3])).toEqual([0, 2, -3]);
      expect(canonicalizeSign([0, 0, -1])).toEqual([0, 0, 1]);
      expect(canonicalizeSign([2, 0, 0])).toEqual([2, 0, 0]);
    });

    it('choosePrimitiveIntegerNormal reduces non-primitive and axis normals', () => {
      expect(choosePrimitiveIntegerNormal([0, 0, 2])).toEqual([0, 0, 1]);
      expect(choosePrimitiveIntegerNormal([2, 2, 0])).toEqual([1, 1, 0]);
      expect(choosePrimitiveIntegerNormal([3, 6, 9])).toEqual([1, 2, 3]);
      // Near-integer oblique.
      expect(choosePrimitiveIntegerNormal([1.0001, 0.9999, 0])).toEqual([
        1, 1, 0,
      ]);
    });

    it('choosePrimitiveIntegerNormal recovers a rational oblique direction', () => {
      const target = [1, 2, 3];
      const len = Math.sqrt(dot(target, target));
      const g = [target[0] / len, target[1] / len, target[2] / len];
      expect(choosePrimitiveIntegerNormal(g)).toEqual([1, 2, 3]);
    });

    it('throws on a (near) zero covector', () => {
      expect(() => choosePrimitiveIntegerNormal([0, 0, 0])).toThrow();
    });
  });

  describe('indexNormalCovectorFromWorld', () => {
    it('returns the world normal scaled by spacing for identity direction', () => {
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const g = indexNormalCovectorFromWorld(identity, [1, 1, 1], [0, 0, 1]);
      expect(g).toEqual([0, 0, 1]);
    });

    it('scales each axis by its spacing', () => {
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const g = indexNormalCovectorFromWorld(
        identity,
        [0.5, 0.5, 2],
        [0, 0, 1]
      );
      expect(g).toEqual([0, 0, 2]);
    });
  });

  describe('buildIntegerBasisFromNormal', () => {
    it('satisfies the unimodular / orthogonality invariants for many normals', () => {
      for (const raw of NORMALS) {
        const normal = makePrimitive(raw);
        const { A, B, C } = buildIntegerBasisFromNormal(normal);

        // Integer entries.
        for (const vec of [A, B, C]) {
          for (const component of vec) {
            expect(Number.isInteger(component)).toBe(true);
          }
        }

        expect(dot(normal, A)).toBe(0);
        expect(dot(normal, B)).toBe(0);
        expect(dot(normal, C)).toBe(1);
        expect(Math.abs(detColumns(A, B, C))).toBe(1);
      }
    });

    it('throws for a non-primitive normal', () => {
      expect(() => buildIntegerBasisFromNormal([2, 4, 6])).toThrow();
    });

    it('throws for a zero normal', () => {
      expect(() => buildIntegerBasisFromNormal([0, 0, 0])).toThrow();
    });
  });

  describe('ijk <-> uvw bijection', () => {
    it('round-trips ijk -> uvw -> ijk and covers a small volume exactly once', () => {
      for (const raw of NORMALS) {
        const normal = makePrimitive(raw);
        const { A, B, C } = buildIntegerBasisFromNormal(normal);
        const basis = { A, B, C, origin: [0, 0, 0] };

        const seenUVW = new Set();
        let count = 0;
        for (let k = 0; k < 5; k++) {
          for (let j = 0; j < 5; j++) {
            for (let i = 0; i < 5; i++) {
              const ijk = [i, j, k];
              const uvw = uvwFromIJK(ijk, basis);
              // uvw are exact integers.
              for (const c of uvw) {
                expect(Number.isInteger(c)).toBe(true);
              }
              // Round-trip.
              const back = ijkFromUVW(uvw[0], uvw[1], uvw[2], basis);
              expect(back).toEqual(ijk);
              // Unique uvw per ijk.
              const key = `${uvw[0]},${uvw[1]},${uvw[2]}`;
              expect(seenUVW.has(key)).toBe(false);
              seenUVW.add(key);
              count++;
            }
          }
        }
        expect(seenUVW.size).toBe(count);
        expect(count).toBe(125);
      }
    });

    it('adjacent w planes are disjoint (w is a single-valued function of ijk)', () => {
      const normal = makePrimitive([1, 2, 3]);
      const { A, B, C } = buildIntegerBasisFromNormal(normal);
      const basis = { A, B, C, origin: [0, 0, 0] };

      const wOf = (ijk) => uvwFromIJK(ijk, basis)[2];

      const byPlane = new Map();
      for (let k = 0; k < 6; k++) {
        for (let j = 0; j < 6; j++) {
          for (let i = 0; i < 6; i++) {
            const w = wOf([i, j, k]);
            if (!byPlane.has(w)) {
              byPlane.set(w, new Set());
            }
            byPlane.get(w).add(`${i},${j},${k}`);
          }
        }
      }

      // Any two distinct planes share no voxel by construction.
      const planes = [...byPlane.entries()];
      for (let a = 0; a < planes.length; a++) {
        for (let b = a + 1; b < planes.length; b++) {
          for (const voxel of planes[a][1]) {
            expect(planes[b][1].has(voxel)).toBe(false);
          }
        }
      }
    });
  });

  describe('range helpers', () => {
    it('intersectRange / isRangeEmpty', () => {
      expect(intersectRange({ min: 0, max: 10 }, { min: 3, max: 7 })).toEqual({
        min: 3,
        max: 7,
      });
      expect(
        isRangeEmpty(intersectRange({ min: 0, max: 2 }, { min: 5, max: 9 }))
      ).toBe(true);
      expect(isRangeEmpty({ min: 0, max: 0 })).toBe(false);
    });
  });

  describe('clipIntegerLineToBox', () => {
    const W = 10;
    const H = 10;
    const D = 10;

    it('clips a positive-step line exactly', () => {
      // base [0,0,0] step [1,0,0] -> i in [0,9]
      const r = clipIntegerLineToBox(
        { min: -100, max: 100 },
        [0, 0, 0],
        [1, 0, 0],
        W,
        H,
        D
      );
      expect(r).toEqual({ min: 0, max: 9 });
    });

    it('clips a negative-step line exactly', () => {
      // base [9,0,0] step [-1,0,0] -> i = 9 - t in [0,9] -> t in [0,9]
      const r = clipIntegerLineToBox(
        { min: -100, max: 100 },
        [9, 0, 0],
        [-1, 0, 0],
        W,
        H,
        D
      );
      expect(r).toEqual({ min: 0, max: 9 });
    });

    it('respects a zero-step component that is in range', () => {
      const r = clipIntegerLineToBox(
        { min: -100, max: 100 },
        [0, 5, 0],
        [1, 0, 0],
        W,
        H,
        D
      );
      expect(r).toEqual({ min: 0, max: 9 });
    });

    it('returns empty for a zero-step component out of range', () => {
      const r = clipIntegerLineToBox(
        { min: -100, max: 100 },
        [0, 20, 0],
        [1, 0, 0],
        W,
        H,
        D
      );
      expect(isRangeEmpty(r)).toBe(true);
    });

    it('handles a diagonal step and intersects with the initial range', () => {
      // base [0,0,0], step [1,1,1] -> t in [0,9]; initial caps at 4.
      const r = clipIntegerLineToBox(
        { min: 0, max: 4 },
        [0, 0, 0],
        [1, 1, 1],
        W,
        H,
        D
      );
      expect(r).toEqual({ min: 0, max: 4 });
    });

    it('handles a non-unit negative step with an offset base', () => {
      // base [8,0,0], step [-2,0,0] -> i = 8 - 2t in [0,9] -> t in [0,4]
      const r = clipIntegerLineToBox(
        { min: -100, max: 100 },
        [8, 0, 0],
        [-2, 0, 0],
        W,
        H,
        D
      );
      expect(r).toEqual({ min: 0, max: 4 });
    });
  });

  describe('computeUVWRangesFromBounds', () => {
    it('produces an envelope that contains every in-volume voxel', () => {
      const normal = makePrimitive([1, 2, 2]);
      const { A, B, C } = buildIntegerBasisFromNormal(normal);
      const basis = { A, B, C, origin: [0, 0, 0] };
      const dims = [7, 7, 7];
      const { uRange, vRange, wRange } = computeUVWRangesFromBounds(
        basis,
        dims[0],
        dims[1],
        dims[2]
      );

      for (let k = 0; k < dims[2]; k++) {
        for (let j = 0; j < dims[1]; j++) {
          for (let i = 0; i < dims[0]; i++) {
            const [u, v, w] = uvwFromIJK([i, j, k], basis);
            expect(u).toBeGreaterThanOrEqual(uRange.min);
            expect(u).toBeLessThanOrEqual(uRange.max);
            expect(v).toBeGreaterThanOrEqual(vRange.min);
            expect(v).toBeLessThanOrEqual(vRange.max);
            expect(w).toBeGreaterThanOrEqual(wRange.min);
            expect(w).toBeLessThanOrEqual(wRange.max);
          }
        }
      }
    });
  });

  describe('createObliqueIntegerBasis + forEachObliqueVoxel', () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    it('full iteration visits every in-bounds voxel exactly once (oblique)', () => {
      const dims = [8, 8, 8];
      const basis = createObliqueIntegerBasis({
        dimensions: dims,
        direction: identity,
        spacing: [1, 1, 1],
        // Oblique normal.
        viewPlaneNormal: [0, 1 / Math.SQRT2, 1 / Math.SQRT2],
        viewUp: [0, 1, 0],
      });

      const seen = new Set();
      forEachObliqueVoxel(basis, {
        dimensions: dims,
        visit: ({ ijk }) => {
          const [i, j, k] = ijk;
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(dims[0]);
          expect(j).toBeGreaterThanOrEqual(0);
          expect(j).toBeLessThan(dims[1]);
          expect(k).toBeGreaterThanOrEqual(0);
          expect(k).toBeLessThan(dims[2]);
          const key = `${i},${j},${k}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        },
      });

      // No voxel repeats and the full box is covered.
      expect(seen.size).toBe(dims[0] * dims[1] * dims[2]);
    });

    it('is deterministic for the same viewport state', () => {
      const dims = [8, 8, 8];
      const opts = {
        dimensions: dims,
        direction: identity,
        spacing: [1, 1, 1],
        viewPlaneNormal: [1 / Math.SQRT2, 1 / Math.SQRT2, 0],
        viewUp: [0, 0, 1],
      };
      const a = createObliqueIntegerBasis(opts);
      const b = createObliqueIntegerBasis(opts);
      expect(a).toEqual(b);
    });

    it('orients A/B so that they track viewRight/viewUp', () => {
      // Reorienting must preserve the plane and the C column.
      const normal = makePrimitive([0, 0, 1]);
      const { A, B, C } = buildIntegerBasisFromNormal(normal);
      const oriented = orientBasisToViewUp(A, B, [1, 0, 0], [0, 1, 0]);
      expect(dot(normal, oriented.A)).toBe(0);
      expect(dot(normal, oriented.B)).toBe(0);
      // A tracks +x, B tracks +y.
      expect(oriented.A[0]).toBeGreaterThan(0);
      expect(oriented.B[1]).toBeGreaterThan(0);
      expect(dot(normal, C)).toBe(1);
    });
  });

  describe('ellipsoid range clipping', () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    // Brute-force reference: voxels within world distance r of centerIJK.
    function bruteForceSphere(dims, centerIJK, radius) {
      const set = new Set();
      const r2 = radius * radius;
      for (let k = 0; k < dims[2]; k++) {
        for (let j = 0; j < dims[1]; j++) {
          for (let i = 0; i < dims[0]; i++) {
            const dx = i - centerIJK[0];
            const dy = j - centerIJK[1];
            const dz = k - centerIJK[2];
            if (dx * dx + dy * dy + dz * dz <= r2) {
              set.add(`${i},${j},${k}`);
            }
          }
        }
      }
      return set;
    }

    it('enumerates a sphere exactly via nested integer ranges (oblique basis)', () => {
      const dims = [25, 25, 25];
      const centerIJK = [12, 12, 12];
      const radius = 6;

      const basis = createObliqueIntegerBasis({
        dimensions: dims,
        direction: identity,
        spacing: [1, 1, 1],
        viewPlaneNormal: [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
        viewUp: [0, 1, 0],
      });

      const Q = sphereIndexQuadratic(identity, [1, 1, 1], radius);
      const ellipsoid = ellipsoidUVWFromIndexQuadratic(Q, centerIJK, basis);

      const wRange = getWRangeForUVWEllipsoid(ellipsoid);
      const enumerated = new Set();
      forEachObliqueVoxel(basis, {
        wRange,
        getURangeForW: (w) => getURangeForW(ellipsoid, w),
        getVRangeForWU: (w, u) => getVRangeForWU(ellipsoid, w, u),
        dimensions: dims,
        visit: ({ ijk }) => {
          enumerated.add(`${ijk[0]},${ijk[1]},${ijk[2]}`);
        },
      });

      const reference = bruteForceSphere(dims, centerIJK, radius);

      expect(enumerated.size).toBe(reference.size);
      for (const key of reference) {
        expect(enumerated.has(key)).toBe(true);
      }
    });

    it('produces the same sphere voxels for an axis-aligned view', () => {
      const dims = [25, 25, 25];
      const centerIJK = [10, 12, 14];
      const radius = 5;

      const basis = createObliqueIntegerBasis({
        dimensions: dims,
        direction: identity,
        spacing: [1, 1, 1],
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, 1, 0],
      });

      const Q = sphereIndexQuadratic(identity, [1, 1, 1], radius);
      const ellipsoid = ellipsoidUVWFromIndexQuadratic(Q, centerIJK, basis);

      const wRange = getWRangeForUVWEllipsoid(ellipsoid);
      const enumerated = new Set();
      forEachObliqueVoxel(basis, {
        wRange,
        getURangeForW: (w) => getURangeForW(ellipsoid, w),
        getVRangeForWU: (w, u) => getVRangeForWU(ellipsoid, w, u),
        dimensions: dims,
        visit: ({ ijk }) => {
          enumerated.add(`${ijk[0]},${ijk[1]},${ijk[2]}`);
        },
      });

      const reference = bruteForceSphere(dims, centerIJK, radius);
      expect(enumerated.size).toBe(reference.size);
      for (const key of reference) {
        expect(enumerated.has(key)).toBe(true);
      }
    });

    it('enumerates an anisotropic-spacing sphere exactly', () => {
      const dims = [25, 25, 25];
      const centerIJK = [12, 12, 12];
      const radiusWorld = 6;
      const spacing = [1, 1, 2];

      const basis = createObliqueIntegerBasis({
        dimensions: dims,
        direction: identity,
        spacing,
        viewPlaneNormal: [0, 1 / Math.SQRT2, 1 / Math.SQRT2],
        viewUp: [0, 1, 0],
      });

      const Q = sphereIndexQuadratic(identity, spacing, radiusWorld);
      const ellipsoid = ellipsoidUVWFromIndexQuadratic(Q, centerIJK, basis);

      const wRange = getWRangeForUVWEllipsoid(ellipsoid);
      const enumerated = new Set();
      forEachObliqueVoxel(basis, {
        wRange,
        getURangeForW: (w) => getURangeForW(ellipsoid, w),
        getVRangeForWU: (w, u) => getVRangeForWU(ellipsoid, w, u),
        dimensions: dims,
        visit: ({ ijk }) => {
          enumerated.add(`${ijk[0]},${ijk[1]},${ijk[2]}`);
        },
      });

      // Brute force in world space with anisotropic spacing.
      const reference = new Set();
      const r2 = radiusWorld * radiusWorld;
      for (let k = 0; k < dims[2]; k++) {
        for (let j = 0; j < dims[1]; j++) {
          for (let i = 0; i < dims[0]; i++) {
            const dx = (i - centerIJK[0]) * spacing[0];
            const dy = (j - centerIJK[1]) * spacing[1];
            const dz = (k - centerIJK[2]) * spacing[2];
            if (dx * dx + dy * dy + dz * dz <= r2) {
              reference.add(`${i},${j},${k}`);
            }
          }
        }
      }

      expect(enumerated.size).toBe(reference.size);
      for (const key of reference) {
        expect(enumerated.has(key)).toBe(true);
      }
    });
  });

  describe('normal error bound', () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const VOXEL_DIAGONAL = Math.sqrt(3);

    it('integerNormalAngularSin is 0 for aligned and grows with angle', () => {
      expect(integerNormalAngularSin([1, 0, 0], [2, 0, 0])).toBeCloseTo(0);
      expect(integerNormalAngularSin([1, 0, 0], [0, 1, 0])).toBeCloseTo(1);
      // 45 degrees -> sin = sqrt(1/2).
      expect(integerNormalAngularSin([1, 0, 0], [1, 1, 0])).toBeCloseTo(
        Math.SQRT1_2
      );
    });

    it('obliquePlaneEdgeDrift scales with volume extent and angle', () => {
      // g is 45 degrees from N -> drift = extent * sin(45).
      expect(obliquePlaneEdgeDrift([1, 0, 0], [1, 1, 0], 10)).toBeCloseTo(
        10 * Math.SQRT1_2
      );
    });

    it('keeps the edge drift within one voxel diagonal for a small oblique volume', () => {
      // ~2.86 degrees oblique (index-space covector).
      const g = [1, 0.05, 0];
      const volumeExtent = 10;
      const normal = choosePrimitiveIntegerNormal(g, {
        volumeExtent,
        maxNormalDrift: VOXEL_DIAGONAL,
      });
      const drift = obliquePlaneEdgeDrift(normal, g, volumeExtent);
      expect(drift).toBeLessThanOrEqual(VOXEL_DIAGONAL + 1e-9);
      // A small volume tolerates the coarse axis-aligned normal.
      expect(normal).toEqual([1, 0, 0]);
    });

    it('selects a finer normal for a large volume so drift stays bounded', () => {
      const g = [1, 0.05, 0];
      const smallExtent = 10;
      const largeExtent = 400;

      const coarse = choosePrimitiveIntegerNormal(g, {
        volumeExtent: smallExtent,
        maxNormalDrift: VOXEL_DIAGONAL,
      });
      const fine = choosePrimitiveIntegerNormal(g, {
        volumeExtent: largeExtent,
        maxNormalDrift: VOXEL_DIAGONAL,
      });

      // The large-volume normal must be strictly more accurate...
      expect(integerNormalAngularSin(fine, g)).toBeLessThan(
        integerNormalAngularSin(coarse, g)
      );
      // ...and it must satisfy the drift bound at the large extent, which the
      // coarse normal does not.
      expect(obliquePlaneEdgeDrift(fine, g, largeExtent)).toBeLessThanOrEqual(
        VOXEL_DIAGONAL + 1e-9
      );
      expect(obliquePlaneEdgeDrift(coarse, g, largeExtent)).toBeGreaterThan(
        VOXEL_DIAGONAL
      );
    });

    it('createObliqueIntegerBasis honors the drift bound for a large oblique volume', () => {
      const dims = [256, 256, 64];
      // World normal a few degrees off the k axis.
      const viewPlaneNormal = vecNormalize([0.06, 0, 1]);
      const basis = createObliqueIntegerBasis({
        dimensions: dims,
        direction: identity,
        spacing: [1, 1, 1],
        viewPlaneNormal,
        viewUp: [0, 1, 0],
      });

      const g = indexNormalCovectorFromWorld(
        identity,
        [1, 1, 1],
        viewPlaneNormal
      );
      const volumeExtent = Math.hypot(dims[0] - 1, dims[1] - 1, dims[2] - 1);
      const drift = obliquePlaneEdgeDrift(basis.normal, g, volumeExtent);
      expect(drift).toBeLessThanOrEqual(VOXEL_DIAGONAL + 1e-9);
      // The basis is still a valid unimodular integer basis.
      expect(dot(basis.normal, basis.A)).toBe(0);
      expect(dot(basis.normal, basis.B)).toBe(0);
      expect(dot(basis.normal, basis.C)).toBe(1);
      expect(Math.abs(detColumns(basis.A, basis.B, basis.C))).toBe(1);
    });
  });

  describe('full volume coverage', () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    const coverageCases = [
      {
        name: 'axis-aligned',
        dims: [7, 9, 5],
        spacing: [1, 1, 1],
        viewPlaneNormal: [0, 0, 1],
      },
      {
        name: 'oblique 45 in y/z',
        dims: [8, 8, 8],
        spacing: [1, 1, 1],
        viewPlaneNormal: [0, Math.SQRT1_2, Math.SQRT1_2],
      },
      {
        name: 'oblique diagonal',
        dims: [9, 9, 9],
        spacing: [1, 1, 1],
        viewPlaneNormal: vecNormalize([1, 1, 1]),
      },
      {
        name: 'anisotropic spacing oblique',
        dims: [10, 8, 6],
        spacing: [1, 1, 2],
        viewPlaneNormal: vecNormalize([0, 1, 1]),
      },
    ];

    for (const testCase of coverageCases) {
      it(`covers every voxel exactly once over the full u,v,w ranges (${testCase.name})`, () => {
        const { dims, spacing, viewPlaneNormal } = testCase;
        const basis = createObliqueIntegerBasis({
          dimensions: dims,
          direction: identity,
          spacing,
          viewPlaneNormal,
          viewUp: [0, 1, 0],
        });

        // Enumerate the FULL rectangular u,v,w envelope directly (no shape
        // ranges), clipped only to the voxel box.
        const seen = new Set();
        forEachObliqueVoxel(basis, {
          dimensions: dims,
          visit: ({ ijk }) => {
            seen.add(`${ijk[0]},${ijk[1]},${ijk[2]}`);
          },
        });

        // Every voxel of the volume is present, and none more than once.
        const total = dims[0] * dims[1] * dims[2];
        expect(seen.size).toBe(total);
        for (let k = 0; k < dims[2]; k++) {
          for (let j = 0; j < dims[1]; j++) {
            for (let i = 0; i < dims[0]; i++) {
              expect(seen.has(`${i},${j},${k}`)).toBe(true);
            }
          }
        }
      });
    }
  });

  describe('oblique circle area from voxel count', () => {
    // Identity direction + isotropic spacing => the voxel-to-world matrix is the
    // identity, so world == index and the world area of one (u, v) lattice cell
    // is |A x B|. Counting the voxels of a single integer w-plane inside a circle
    // of radius r and multiplying by that cell area estimates the circle area.
    // Because the basis is unimodular (exactly one voxel per (u, v), no
    // duplicates or gaps between planes) this estimate is UNBIASED: the only
    // error is the standard lattice/Gauss-circle quantization O(r), i.e. relative
    // error O(1/r) - identical to an axis-aligned circle, with no extra bias from
    // the oblique orientation.
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const length = (a) => Math.sqrt(dot(a, a));

    function estimateCircleArea(normalRaw, r) {
      const normal = makePrimitive(normalRaw);
      const { A, B, C } = buildIntegerBasisFromNormal(normal);
      const basis = { A, B, C, origin: [0, 0, 0] };
      const cellArea = length(cross(A, B));

      const win = Math.ceil(r) + 5;
      let count = 0;
      for (let u = -win; u <= win; u++) {
        for (let v = -win; v <= win; v++) {
          const ijk = ijkFromUVW(u, v, 0, basis);
          // The (u, v) displacement lies in the plane, so its world length is
          // exactly the in-plane radius.
          if (dot(ijk, ijk) <= r * r) {
            count++;
          }
        }
      }
      return { count, cellArea, estimate: count * cellArea };
    }

    const normals = [
      [0, 0, 1], // axis-aligned reference
      [0, 3, 4], // oblique, coarse in-plane lattice (cellArea 5)
      [1, 1, 1], // fully oblique (cellArea sqrt 3)
      [1, 2, 2], // oblique (cellArea 3)
    ];

    it('converges to pi*r^2 for oblique circles with no obliquity bias', () => {
      // At a large radius every oblique normal reaches the same sub-1% accuracy
      // as the axis-aligned reference. A fixed obliquity bias would instead leave
      // a residual relative error that does not shrink with radius; it does, so
      // count * cellArea is an unbiased area estimate.
      for (const normal of normals) {
        const r = 160;
        const truth = Math.PI * r * r;
        const { estimate } = estimateCircleArea(normal, r);
        const relErr = Math.abs(estimate - truth) / truth;
        expect(relErr).toBeLessThan(0.01);
      }
    });

    it('shrinking mean error confirms O(1/r) convergence (radius-averaged)', () => {
      // Average |relErr| over several radii to smooth out Gauss-circle
      // fluctuations: the averaged error must fall as the radius grows.
      for (const normal of normals) {
        const meanRelErr = (radii) => {
          let sum = 0;
          for (const r of radii) {
            const truth = Math.PI * r * r;
            const { estimate } = estimateCircleArea(normal, r);
            sum += Math.abs(estimate - truth) / truth;
          }
          return sum / radii.length;
        };
        const smallRadii = [8, 10, 12, 14, 16];
        const largeRadii = [120, 130, 140, 150, 160];
        expect(meanRelErr(largeRadii)).toBeLessThan(meanRelErr(smallRadii));
      }
    });

    it('absolute error stays within the O(r) lattice-quantization bound', () => {
      // |count*cellArea - pi*r^2| <= K * r for a modest constant K.
      for (const normal of normals) {
        const r = 120;
        const { estimate, cellArea } = estimateCircleArea(normal, r);
        const truth = Math.PI * r * r;
        // Generous per-cell quantization budget along the boundary.
        const bound = 8 * cellArea * r;
        expect(Math.abs(estimate - truth)).toBeLessThan(bound);
      }
    });
  });
});

function vecNormalize(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}
