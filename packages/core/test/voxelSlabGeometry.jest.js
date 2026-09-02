import getVoxelThicknessAlongNormal from '../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';
import getSpacingInNormalDirection from '../src/utilities/getSpacingInNormalDirection';
import {
  getMembershipHalfWidth,
  getDisplayHalfWidth,
  getSlabEpsilon,
  resolveAnnotationThickness,
  isVoxelCenterInSlab,
  signedDistanceToPlane,
  projectPointOntoPlane,
} from '../src/utilities/voxelSlab/slabMembership';
import {
  createSyntheticVolume,
  rotatedDirection,
  acquisitionNormal,
  obliqueNormal,
} from './utils/syntheticVolume';
import { referenceLayers } from './utils/voxelSlabReference';

// A stack of 8 isotropic 1 mm voxels along k, centres at z = 0..7.
const isotropic = () =>
  createSyntheticVolume({ dimensions: [1, 1, 8], spacing: [1, 1, 1] });

const AXIAL = [0, 0, 1];

describe('getVoxelThicknessAlongNormal', () => {
  it('returns the slice spacing in acquisition orientation', () => {
    const volume = createSyntheticVolume({
      dimensions: [4, 4, 4],
      spacing: [0.7, 0.7, 2.5],
    });

    expect(getVoxelThicknessAlongNormal(volume, AXIAL)).toBeCloseTo(2.5, 10);
  });

  it('returns the in-plane spacing when looking along an in-plane axis', () => {
    const volume = createSyntheticVolume({
      dimensions: [4, 4, 4],
      spacing: [0.7, 1.3, 2.5],
    });

    expect(getVoxelThicknessAlongNormal(volume, [1, 0, 0])).toBeCloseTo(
      0.7,
      10
    );
    expect(getVoxelThicknessAlongNormal(volume, [0, 1, 0])).toBeCloseTo(
      1.3,
      10
    );
  });

  it('is unaffected by the sign of the normal', () => {
    const volume = createSyntheticVolume({
      dimensions: [4, 4, 4],
      spacing: [1, 1, 3],
    });
    const normal = obliqueNormal(volume.direction, 45);
    const flipped = normal.map((v) => -v);

    expect(getVoxelThicknessAlongNormal(volume, flipped)).toBeCloseTo(
      getVoxelThicknessAlongNormal(volume, normal),
      10
    );
  });

  it('tracks the direction matrix, not just the spacing', () => {
    // Rotating the volume by 45 degrees about x and then looking along the
    // rotated k axis must still report the k spacing.
    const direction = rotatedDirection(45, 'x');
    const volume = createSyntheticVolume({
      dimensions: [4, 4, 4],
      spacing: [1, 1, 3],
      direction,
    });

    expect(
      getVoxelThicknessAlongNormal(volume, acquisitionNormal(direction))
    ).toBeCloseTo(3, 10);
  });

  describe('versus getSpacingInNormalDirection', () => {
    it('agrees whenever the normal is parallel to a voxel axis', () => {
      const volume = createSyntheticVolume({
        dimensions: [4, 4, 4],
        spacing: [0.7, 1.3, 2.5],
      });

      for (const normal of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]) {
        // Only to 7 places: getSpacingInNormalDirection accumulates through
        // gl-matrix's vec3, which is a Float32Array, so it carries float32
        // precision. getVoxelThicknessAlongNormal stays in float64, which is
        // one reason not to build the slab tests on top of it.
        expect(getVoxelThicknessAlongNormal(volume, normal)).toBeCloseTo(
          getSpacingInNormalDirection(volume, normal),
          7
        );
      }
    });

    it('reports the larger support width for an oblique normal', () => {
      // 1x1x3 mm voxels, normal 45 degrees between the i and k axes.
      // L1 (support width of the voxel box) = (1 + 3) * cos45 = 2*sqrt(2).
      // L2 (projected spacing length)       = sqrt(1 + 9) * cos45 = sqrt(5).
      const volume = createSyntheticVolume({
        dimensions: [4, 4, 4],
        spacing: [1, 1, 3],
      });
      const normal = obliqueNormal(volume.direction, 45);

      expect(getVoxelThicknessAlongNormal(volume, normal)).toBeCloseTo(
        2 * Math.SQRT2,
        10
      );
      // 6 places, not more: this is the float32 result discussed above.
      expect(getSpacingInNormalDirection(volume, normal)).toBeCloseTo(
        Math.sqrt(5),
        6
      );
      expect(getVoxelThicknessAlongNormal(volume, normal)).toBeGreaterThan(
        getSpacingInNormalDirection(volume, normal)
      );
    });
  });
});

describe('slab half widths', () => {
  it('uses (T + T_v) / 2 for membership, with no viewport term', () => {
    expect(getMembershipHalfWidth(2, 1)).toBe(1.5);
    expect(getMembershipHalfWidth(1, 1)).toBe(1);
    expect(getMembershipHalfWidth(0.5, 1)).toBe(0.75);
  });

  it('uses (t + T) / 2 for display, with no voxel term', () => {
    expect(getDisplayHalfWidth(2, 1)).toBe(1.5);
    expect(getDisplayHalfWidth(0, 1)).toBe(0.5);
  });

  it('defaults an unrecorded annotation thickness to one voxel', () => {
    expect(resolveAnnotationThickness(undefined, 2.5)).toBe(2.5);
    expect(resolveAnnotationThickness(null, 2.5)).toBe(2.5);
    expect(resolveAnnotationThickness(NaN, 2.5)).toBe(2.5);
    expect(resolveAnnotationThickness(0, 2.5)).toBe(0);
    expect(resolveAnnotationThickness(4, 2.5)).toBe(4);
  });

  it('scales the epsilon with the voxel thickness', () => {
    expect(getSlabEpsilon(1)).toBe(1e-6);
    expect(getSlabEpsilon(0.001)).toBe(1e-9);
    expect(getSlabEpsilon(-3)).toBe(3e-6);
  });
});

describe('plane arithmetic', () => {
  it('measures signed distance along the normal', () => {
    expect(signedDistanceToPlane([0, 0, 4], [0, 0, 3], AXIAL)).toBe(1);
    expect(signedDistanceToPlane([0, 0, 2], [0, 0, 3], AXIAL)).toBe(-1);
    // Movement within the plane does not change the distance.
    expect(signedDistanceToPlane([50, -20, 3], [0, 0, 3], AXIAL)).toBe(0);
  });

  it('projects along the normal onto the plane', () => {
    expect(projectPointOntoPlane([5, 6, 9], [0, 0, 3], AXIAL)).toEqual([
      5, 6, 3,
    ]);
  });
});

// The table in https://github.com/cornerstonejs/cornerstone3D/issues/2889
// under "Worked examples". T_v = 1 mm, voxel centres at integer k.
describe('Rule M worked examples', () => {
  const cases = [
    {
      name: 'T = 0.5 centred on a voxel selects exactly that voxel',
      thickness: 0.5,
      anchorZ: 3,
      expected: [3],
    },
    {
      name: 'T = T_v centred on a voxel selects exactly one layer',
      thickness: 1,
      anchorZ: 3,
      expected: [3],
    },
    {
      name: 'T = T_v on a voxel edge selects both overlapping voxels',
      thickness: 1,
      anchorZ: 3.5,
      expected: [3, 4],
    },
    {
      name: 'any increase past T_v pulls in both neighbours',
      thickness: 1.00001,
      anchorZ: 3,
      expected: [2, 3, 4],
    },
    {
      name: 'T = 2 * T_v selects the three genuinely overlapping layers',
      thickness: 2,
      anchorZ: 3,
      expected: [2, 3, 4],
    },
  ];

  cases.forEach(({ name, thickness, anchorZ, expected }) => {
    it(name, () => {
      expect(
        referenceLayers({
          volume: isotropic(),
          planePoint: [0, 0, anchorZ],
          normal: AXIAL,
          annotationThickness: thickness,
        })
      ).toEqual(expected);
    });
  });
});

describe('invariant I5 - acquisition orientation selects the displayed slice only', () => {
  it('selects exactly one layer for every voxel-centred anchor', () => {
    const volume = isotropic();

    for (let k = 1; k < 7; k++) {
      expect(
        referenceLayers({
          volume,
          planePoint: [0, 0, k],
          normal: AXIAL,
          // Unset thickness defaults to one voxel, as on a stack viewport.
          annotationThickness: undefined,
        })
      ).toEqual([k]);
    }
  });

  it('holds for anisotropic slice spacing', () => {
    const volume = createSyntheticVolume({
      dimensions: [1, 1, 8],
      spacing: [0.7, 0.7, 2.5],
    });

    expect(
      referenceLayers({
        volume,
        planePoint: [0, 0, 2.5 * 4],
        normal: AXIAL,
      })
    ).toEqual([4]);
  });

  it('holds for sub-millimetre spacing, where an absolute epsilon would fail', () => {
    const spacing = 0.001;
    const volume = createSyntheticVolume({
      dimensions: [1, 1, 8],
      spacing: [spacing, spacing, spacing],
    });

    expect(
      referenceLayers({
        volume,
        planePoint: [0, 0, spacing * 4],
        normal: AXIAL,
      })
    ).toEqual([4]);
  });
});

describe('invariant I4 - at least one layer whenever T >= T_v', () => {
  it('never returns an empty set, wherever the plane falls between centres', () => {
    const volume = isotropic();

    for (let offset = 0; offset < 1; offset += 0.05) {
      const layers = referenceLayers({
        volume,
        planePoint: [0, 0, 3 + offset],
        normal: AXIAL,
        annotationThickness: 1,
      });

      expect(layers.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('holds for oblique normals too', () => {
    const volume = createSyntheticVolume({
      dimensions: [8, 8, 8],
      spacing: [1, 1, 3],
    });
    const normal = obliqueNormal(volume.direction, 37);
    const voxelThickness = getVoxelThicknessAlongNormal(volume, normal);

    for (let offset = 0; offset < 1; offset += 0.1) {
      const anchor = [3 + offset, 3, 9];
      const layers = referenceLayers({
        volume,
        planePoint: anchor,
        normal,
        annotationThickness: voxelThickness,
      });

      expect(layers.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('epsilon guards the exact boundary', () => {
  it('excludes a neighbour sitting exactly on the boundary', () => {
    // The neighbour is at |delta| = T_v = d exactly. Without the epsilon this
    // is at the mercy of floating point noise.
    expect(isVoxelCenterInSlab([0, 0, 4], [0, 0, 3], AXIAL, 1, 1)).toBe(false);
    expect(isVoxelCenterInSlab([0, 0, 3], [0, 0, 3], AXIAL, 1, 1)).toBe(true);
  });

  it('stays stable when the anchor carries floating point error', () => {
    // An anchor accumulated through world<->index round trips will not be
    // exactly 3, and the result must not flip.
    const noisyAnchors = [3, 3 + 1e-13, 3 - 1e-13, 3 + 1e-15, 3 - 1e-15];

    noisyAnchors.forEach((z) => {
      expect(
        referenceLayers({
          volume: isotropic(),
          planePoint: [0, 0, z],
          normal: AXIAL,
          annotationThickness: 1,
        })
      ).toEqual([3]);
    });
  });
});
