import { vec3 } from 'gl-matrix';
import { collectVoxelsInShape } from '../src/utilities/voxelSlab/iterateVoxelsInShape';
import { buildIndexSpaceSlab } from '../src/utilities/voxelSlab/indexSpaceSlab';
import getVoxelThicknessAlongNormal from '../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';
import { createSyntheticVolume } from './utils/syntheticVolume';

const DIM = 25;
const AXIAL = [0, 0, 1];

/** The standard basis rotated by `degrees` about the i axis. */
function directionAboutI(degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [1, 0, 0, 0, cos, -sin, 0, sin, cos];
}

function makeVolume(degrees, spacing = [1, 1, 1]) {
  return createSyntheticVolume({
    dimensions: [DIM, DIM, DIM],
    spacing,
    direction: directionAboutI(degrees),
    origin: [0, 0, 0],
  });
}

/**
 * Every voxel the fill writes at each of the plane positions, as a map from the
 * voxel key to the number of positions that wrote it.
 *
 * The positions are `T_v` apart, which is the spacing at which the slabs of
 * Rule F tile. The range covers the whole volume, so every voxel must appear.
 */
function countWritesOverAllPlanes(volume, normal, depthInterval) {
  const voxelThickness = getVoxelThicknessAlongNormal(volume, normal);

  // The extent of the volume along the normal, from its eight corners.
  const projections = [];
  for (const i of [0, DIM - 1]) {
    for (const j of [0, DIM - 1]) {
      for (const k of [0, DIM - 1]) {
        projections.push(vec3.dot(volume.indexToWorld([i, j, k]), normal));
      }
    }
  }
  const min = Math.min(...projections);
  const max = Math.max(...projections);

  const counts = new Map();

  // One extra plane at each end, so that no voxel is missed only because the
  // range stopped short.
  const first = Math.floor(min / voxelThickness) - 1;
  const last = Math.ceil(max / voxelThickness) + 1;

  for (let m = first; m <= last; m++) {
    const depth = m * voxelThickness;
    const planePoint = [
      normal[0] * depth,
      normal[1] * depth,
      normal[2] * depth,
    ];

    const voxels = collectVoxelsInShape({
      volume,
      planePoint,
      viewPlaneNormal: normal,
      membershipHalfWidth: voxelThickness / 2,
      depthInterval,
    });

    for (const ijk of voxels) {
      const key = ijk.join(',');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return counts;
}

function tally(counts) {
  let once = 0;
  let repeated = 0;
  for (const count of counts.values()) {
    if (count === 1) {
      once++;
    } else {
      repeated++;
    }
  }
  return { once, repeated, missed: DIM ** 3 - counts.size };
}

describe('the half-open depth interval of Rule F', () => {
  // 45 degrees puts the depths of the voxel centres exactly on the boundaries
  // of the slab, which is the case the open interval loses.
  const cases = [
    ['axis aligned', 0, [1, 1, 1]],
    ['oblique 30 degrees', 30, [1, 1, 1]],
    ['oblique 45 degrees', 45, [1, 1, 1]],
    ['oblique 60 degrees', 60, [1, 1, 1]],
    ['oblique 45 degrees, anisotropic', 45, [0.7, 0.7, 3]],
  ];

  describe.each(cases)('%s', (label, degrees, spacing) => {
    const volume = makeVolume(degrees, spacing);

    it('writes every voxel exactly once over consecutive planes', () => {
      const { once, repeated, missed } = tally(
        countWritesOverAllPlanes(volume, AXIAL, 'half-open')
      );

      expect(missed).toBe(0);
      expect(repeated).toBe(0);
      expect(once).toBe(DIM ** 3);
    });
  });

  it('loses the voxels on the boundary without the half-open interval', () => {
    // The regression this guards. At 45 degrees the open interval drops both
    // boundaries, so every second plane of the lattice is unreachable.
    const volume = makeVolume(45);
    const open = tally(countWritesOverAllPlanes(volume, AXIAL, 'open'));
    const halfOpen = tally(
      countWritesOverAllPlanes(volume, AXIAL, 'half-open')
    );

    expect(open.missed).toBeGreaterThan(0.4 * DIM ** 3);
    expect(halfOpen.missed).toBe(0);
  });

  it('defaults to the open interval, so Rule M does not change', () => {
    const volume = makeVolume(45);
    const slab = buildIndexSpaceSlab(volume, [0, 0, 0], AXIAL, 1);

    expect(slab.halfOpen).toBe(false);

    const withoutOption = collectVoxelsInShape({
      volume,
      planePoint: [0, 0, 0],
      viewPlaneNormal: AXIAL,
      membershipHalfWidth: 1,
    });
    const explicitlyOpen = collectVoxelsInShape({
      volume,
      planePoint: [0, 0, 0],
      viewPlaneNormal: AXIAL,
      membershipHalfWidth: 1,
      depthInterval: 'open',
    });

    expect(withoutOption).toEqual(explicitlyOpen);
  });

  it('keeps the interval one voxel thickness wide', () => {
    const volume = makeVolume(45);
    const voxelThickness = getVoxelThicknessAlongNormal(volume, AXIAL);
    const slab = buildIndexSpaceSlab(volume, [0, 0, 0], AXIAL, null, {
      membershipHalfWidth: voxelThickness / 2,
      depthInterval: 'half-open',
    });

    expect(slab.halfOpen).toBe(true);
    // The epsilon shifts the interval, and the epsilon must not narrow it, or
    // consecutive slabs would leave a gap between them.
    expect(slab.depthHigh - slab.depthLow).toBeCloseTo(voxelThickness, 10);
  });
});
