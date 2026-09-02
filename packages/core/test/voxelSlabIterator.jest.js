import { collectVoxelsInSlab } from '../src/utilities/voxelSlab/iterateVoxelsInSlab';
import {
  buildIndexSpaceSlab,
  getIndexSpaceNormal,
  depthAtIndex,
} from '../src/utilities/voxelSlab/indexSpaceSlab';
import { projectPointOntoPlane } from '../src/utilities/voxelSlab/slabMembership';
import getVoxelThicknessAlongNormal from '../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';
import {
  createSyntheticVolume,
  rotatedDirection,
  acquisitionNormal,
  obliqueNormal,
} from './utils/syntheticVolume';
import {
  referenceVoxelsInSlab,
  canonicaliseVoxels,
} from './utils/voxelSlabReference';

/**
 * A disc of the given radius lying in the annotation plane, as a world-space
 * predicate. Both the oracle and the fast iterator are given the same one so
 * the comparison is apples to apples.
 */
function discInPlane(planePoint, normal, radius) {
  const radiusSquared = radius * radius;
  return (center) => {
    const projected = projectPointOntoPlane(center, planePoint, normal);
    const dx = projected[0] - planePoint[0];
    const dy = projected[1] - planePoint[1];
    const dz = projected[2] - planePoint[2];
    return dx * dx + dy * dy + dz * dz <= radiusSquared;
  };
}

/**
 * Runs both implementations over the same case and asserts they agree exactly.
 * Returns the voxel list so callers can make further assertions about it.
 */
function expectAgreement({
  volume,
  planePoint,
  normal,
  annotationThickness,
  shape,
}) {
  const oracle = referenceVoxelsInSlab({
    volume,
    planePoint,
    normal,
    annotationThickness,
    isInShape: shape ? (_projected, _ijk, center) => shape(center) : undefined,
  });

  const fast = collectVoxelsInSlab({
    volume,
    planePoint,
    normal,
    annotationThickness,
    isInShape: shape ? (center) => shape(center) : undefined,
  });

  const canonicalFast = canonicaliseVoxels(fast);

  // I3: nothing omitted, and I2: nothing duplicated. Comparing the sorted
  // string forms rather than Sets means a duplicate shows up as a length
  // mismatch instead of being silently absorbed.
  expect(canonicalFast).toEqual(canonicaliseVoxels(oracle));
  expect(new Set(canonicalFast).size).toBe(canonicalFast.length);

  return fast;
}

describe('getIndexSpaceNormal', () => {
  it('is parallel to (0, 0, 1) in acquisition orientation', () => {
    const volume = createSyntheticVolume({
      dimensions: [4, 4, 4],
      spacing: [0.7, 0.9, 2.5],
    });

    expect(getIndexSpaceNormal(volume, [0, 0, 1])).toEqual([0, 0, 2.5]);
  });

  it('uses the transpose, so anisotropic spacing scales each component', () => {
    // With a rotated direction matrix and anisotropic spacing, using M inverse
    // instead of M transpose would divide by the spacing rather than multiply.
    const direction = rotatedDirection(30, 'x');
    const volume = createSyntheticVolume({
      dimensions: [4, 4, 4],
      spacing: [1, 2, 4],
      direction,
    });
    const normal = acquisitionNormal(direction);

    const g = getIndexSpaceNormal(volume, normal);

    expect(g[0]).toBeCloseTo(0, 10);
    expect(g[1]).toBeCloseTo(0, 10);
    expect(g[2]).toBeCloseTo(4, 10);
  });
});

describe('index space depth matches world space depth', () => {
  it('agrees with the direct world computation for every voxel', () => {
    const direction = rotatedDirection(23, 'y');
    const volume = createSyntheticVolume({
      dimensions: [5, 5, 5],
      spacing: [0.8, 1.1, 2.2],
      direction,
      origin: [-3, 7, 11],
    });
    const normal = obliqueNormal(direction, 31);
    const planePoint = [0.5, 8, 14];

    const slab = buildIndexSpaceSlab(volume, planePoint, normal, 1);

    for (let k = 0; k < 5; k++) {
      for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 5; i++) {
          const center = volume.indexToWorld([i, j, k]);
          const worldDepth =
            (center[0] - planePoint[0]) * normal[0] +
            (center[1] - planePoint[1]) * normal[1] +
            (center[2] - planePoint[2]) * normal[2];

          expect(depthAtIndex(slab, [i, j, k])).toBeCloseTo(worldDepth, 10);
        }
      }
    }
  });
});

describe('iterateVoxelsInSlab agrees with the reference implementation', () => {
  describe('acquisition orientation, depth only', () => {
    const volume = createSyntheticVolume({
      dimensions: [6, 6, 8],
      spacing: [1, 1, 1],
    });

    [0.5, 1, 1.001, 2, 3, 4].forEach((annotationThickness) => {
      it(`T = ${annotationThickness}`, () => {
        expectAgreement({
          volume,
          planePoint: [2, 2, 3],
          normal: [0, 0, 1],
          annotationThickness,
        });
      });
    });

    it('with the plane between two slices', () => {
      expectAgreement({
        volume,
        planePoint: [2, 2, 3.5],
        normal: [0, 0, 1],
        annotationThickness: 1,
      });
    });

    it('with the slab clipped by the volume edge', () => {
      expectAgreement({
        volume,
        planePoint: [2, 2, 0],
        normal: [0, 0, 1],
        annotationThickness: 4,
      });
    });

    it('with the plane entirely outside the volume', () => {
      const voxels = expectAgreement({
        volume,
        planePoint: [2, 2, 40],
        normal: [0, 0, 1],
        annotationThickness: 1,
      });
      expect(voxels).toHaveLength(0);
    });
  });

  describe('oblique normals, depth only', () => {
    const volume = createSyntheticVolume({
      dimensions: [7, 7, 7],
      spacing: [1, 1, 3],
      origin: [0, 0, 0],
    });

    [1, 5, 15, 30, 45, 60, 75, 89].forEach((degrees) => {
      it(`${degrees} degrees off the slice axis`, () => {
        const normal = obliqueNormal(volume.direction, degrees);
        expectAgreement({
          volume,
          planePoint: [3, 3, 9],
          normal,
          annotationThickness: getVoxelThicknessAlongNormal(volume, normal),
        });
      });
    });

    it('handles a normal tilted about two axes at once', () => {
      const direction = rotatedDirection(37, 'x');
      const tilted = createSyntheticVolume({
        dimensions: [7, 7, 7],
        spacing: [0.9, 1.4, 2.1],
        direction,
        origin: [5, -2, 3],
      });
      const normal = obliqueNormal(direction, 41);

      expectAgreement({
        volume: tilted,
        planePoint: [6, 1, 8],
        normal,
        annotationThickness: 4,
      });
    });
  });

  describe('with a 2D shape', () => {
    it('acquisition orientation, disc smaller than the volume', () => {
      const volume = createSyntheticVolume({
        dimensions: [12, 12, 6],
        spacing: [1, 1, 1],
      });
      const planePoint = [6, 6, 3];
      const normal = [0, 0, 1];

      const voxels = expectAgreement({
        volume,
        planePoint,
        normal,
        annotationThickness: 1,
        shape: discInPlane(planePoint, normal, 3.5),
      });

      // Sanity: a single layer, and fewer voxels than the bounding square.
      expect(new Set(voxels.map(([, , k]) => k))).toEqual(new Set([3]));
      expect(voxels.length).toBeLessThan(8 * 8);
      expect(voxels.length).toBeGreaterThan(0);
    });

    it('oblique orientation, disc smaller than the volume', () => {
      const volume = createSyntheticVolume({
        dimensions: [14, 14, 10],
        spacing: [0.8, 0.8, 2.4],
      });
      const normal = obliqueNormal(volume.direction, 35);
      const planePoint = [5, 5, 12];

      expectAgreement({
        volume,
        planePoint,
        normal,
        annotationThickness: getVoxelThicknessAlongNormal(volume, normal),
        shape: discInPlane(planePoint, normal, 3),
      });
    });

    it('thick oblique slab with a disc', () => {
      const volume = createSyntheticVolume({
        dimensions: [12, 12, 12],
        spacing: [1, 1, 1],
        direction: rotatedDirection(20, 'z'),
      });
      const normal = obliqueNormal(volume.direction, 50);
      const planePoint = [6, 6, 6];

      expectAgreement({
        volume,
        planePoint,
        normal,
        annotationThickness: 5,
        shape: discInPlane(planePoint, normal, 4),
      });
    });

    it('a shape that selects nothing', () => {
      const volume = createSyntheticVolume({
        dimensions: [8, 8, 8],
        spacing: [1, 1, 1],
      });
      const planePoint = [4, 4, 4];
      const normal = [0, 0, 1];

      const voxels = expectAgreement({
        volume,
        planePoint,
        normal,
        annotationThickness: 1,
        shape: discInPlane(planePoint, normal, 0.1),
      });

      expect(voxels).toHaveLength(1);
    });
  });

  describe('choice of column axis does not change the result', () => {
    it('produces the same set whichever axis carries the runs', () => {
      const volume = createSyntheticVolume({
        dimensions: [9, 9, 9],
        spacing: [1, 1, 2],
      });
      const normal = obliqueNormal(volume.direction, 28);
      const planePoint = [4, 4, 8];
      const shape = discInPlane(planePoint, normal, 3);

      const slab = buildIndexSpaceSlab(volume, planePoint, normal, 2);
      const allowed = [0, 1, 2].filter((axis) => axis !== slab.outerAxis);

      const results = allowed.map((columnAxis) =>
        canonicaliseVoxels(
          collectVoxelsInSlab({
            volume,
            planePoint,
            normal,
            annotationThickness: 2,
            isInShape: (center) => shape(center),
            columnAxis,
          })
        )
      );

      expect(results[0]).toEqual(results[1]);
      expect(results[0].length).toBeGreaterThan(0);
    });
  });

  describe('bounds', () => {
    it('confines iteration without changing which voxels qualify inside them', () => {
      const volume = createSyntheticVolume({
        dimensions: [10, 10, 10],
        spacing: [1, 1, 1],
      });
      const planePoint = [5, 5, 5];
      const normal = [0, 0, 1];

      const bounded = collectVoxelsInSlab({
        volume,
        planePoint,
        normal,
        annotationThickness: 1,
        bounds: [
          [2, 4],
          [2, 4],
          [0, 9],
        ],
      });

      expect(canonicaliseVoxels(bounded)).toEqual(
        canonicaliseVoxels(
          referenceVoxelsInSlab({
            volume,
            planePoint,
            normal,
            annotationThickness: 1,
          }).filter(([i, j]) => i >= 2 && i <= 4 && j >= 2 && j <= 4)
        )
      );
    });
  });
});

describe('invariant I1 - no display inputs', () => {
  it('is a pure function of geometry, so repeated calls are identical', () => {
    const volume = createSyntheticVolume({
      dimensions: [8, 8, 8],
      spacing: [1, 1, 2],
    });
    const normal = obliqueNormal(volume.direction, 33);
    const planePoint = [4, 4, 8];
    const shape = discInPlane(planePoint, normal, 3);

    const run = () =>
      canonicaliseVoxels(
        collectVoxelsInSlab({
          volume,
          planePoint,
          normal,
          annotationThickness: 2,
          isInShape: (center) => shape(center),
        })
      );

    expect(run()).toEqual(run());
  });
});
