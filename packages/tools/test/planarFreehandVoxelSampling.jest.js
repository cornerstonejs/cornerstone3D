import PlanarFreehandROITool from '../src/tools/annotation/PlanarFreehandROITool';

/**
 * Tests for PlanarFreehandROI voxel selection via `iterateVoxelsInSlab`.
 *
 * The exactness of the iterator itself is covered exhaustively in
 * `packages/core/test/voxelSlab*.jest.js` against a brute-force reference. What
 * matters here is the tool's side of the contract: that the plane, normal and
 * thickness are taken from the annotation rather than from a viewport, that
 * every selected voxel reaches the stats calculator, and that the annotation's
 * own thickness governs how many layers are covered.
 */

/**
 * A vtkImageData-shaped stub carrying only the geometry Rule M needs.
 *
 * @param spacing - mm per voxel per axis
 * @param dimensions - voxel counts per axis
 */
function createImageData(spacing, dimensions) {
  return {
    getDimensions: () => dimensions,
    getDirection: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
    getSpacing: () => spacing,
    getOrigin: () => [0, 0, 0],
    worldToIndex: ([x, y, z]) => [
      x / spacing[0],
      y / spacing[1],
      z / spacing[2],
    ],
  };
}

/**
 * @param thickness - `T` in mm, or undefined to fall back to one voxel
 */
function createAnnotation(thickness) {
  return {
    metadata: {
      viewPlaneNormal: [0, 0, 1],
      planeRestriction: thickness === undefined ? undefined : { thickness },
    },
  };
}

// A 2x2 mm square in the z = 0 plane. Voxel centres sit on integers in x and y,
// so the interior plus the inclusive boundary is i, j in {1, 2, 3}: 9 per layer.
const SQUARE = [
  [1, 1, 0],
  [3, 1, 0],
  [3, 3, 0],
  [1, 3, 0],
];

function createTool({ storePointData }) {
  const tool = new PlanarFreehandROITool();
  const statsCallback = jest.fn();

  tool.configuration.storePointData = storePointData;
  tool.configuration.statsCalculator = {
    statsCallback,
    getStatistics: () => ({ array: [] }),
  };

  return { tool, statsCallback };
}

const voxelManager = {
  getAtIJKPoint: ([i, j, k]) => i + j + k,
};

describe('PlanarFreehandROI voxel sampling', () => {
  it('selects the voxels the contour covers, one layer for a thin annotation', () => {
    const { tool, statsCallback } = createTool({ storePointData: true });

    // T = 0.2 with 0.5 mm voxels gives a half width of (0.2 + 0.5) / 2 = 0.35,
    // so only the k = 0 layer at depth 0 qualifies; k = 1 sits at depth 0.5.
    const points = tool.sampleVoxelsInContour({
      annotation: createAnnotation(0.2),
      points: SQUARE,
      imageData: createImageData([1, 1, 0.5], [8, 8, 8]),
      voxelManager,
    });

    expect(points).toHaveLength(9);
    expect(statsCallback).toHaveBeenCalledTimes(9);

    const selected = points.map(({ pointIJK }) => pointIJK.join(','));
    expect(new Set(selected).size).toBe(9);
    expect(points.every(({ pointIJK }) => pointIJK[2] === 0)).toBe(true);

    for (const i of [1, 2, 3]) {
      for (const j of [1, 2, 3]) {
        expect(selected).toContain(`${i},${j},0`);
      }
    }
  });

  it('covers two thin voxel layers for one thick annotation slice', () => {
    // The NM/CT case in miniature: a contour drawn on a 1 mm slice, measured
    // against a volume reconstructed at 0.5 mm in the same orientation, must
    // cover two voxels back to back. Half width is (1 + 0.5) / 2 = 0.75, so
    // depths 0 and 0.5 qualify and 1.0 does not.
    const { tool, statsCallback } = createTool({ storePointData: true });

    const points = tool.sampleVoxelsInContour({
      annotation: createAnnotation(1),
      points: SQUARE,
      imageData: createImageData([1, 1, 0.5], [8, 8, 8]),
      voxelManager,
    });

    expect(points).toHaveLength(18);
    expect(statsCallback).toHaveBeenCalledTimes(18);

    const layers = new Set(points.map(({ pointIJK }) => pointIJK[2]));
    expect([...layers].sort()).toEqual([0, 1]);

    // Every voxel distinct - no double counting across layers.
    const selected = points.map(({ pointIJK }) => pointIJK.join(','));
    expect(new Set(selected).size).toBe(18);
  });

  it('accumulates statistics even when point data is not stored', () => {
    // Regression: an early return on !storePointData previously skipped the
    // statsCallback as well, so every freehand ROI reported NaN by default.
    // storePointData defaults to false.
    const { tool, statsCallback } = createTool({ storePointData: false });

    const points = tool.sampleVoxelsInContour({
      annotation: createAnnotation(0.2),
      points: SQUARE,
      imageData: createImageData([1, 1, 0.5], [8, 8, 8]),
      voxelManager,
    });

    expect(points).toHaveLength(0);
    expect(statsCallback).toHaveBeenCalledTimes(9);
  });

  it('selects the same voxels regardless of voxel size along the normal', () => {
    // Two volumes differing only in through-plane spacing, both measured with
    // T = 1: the 1 mm volume covers one layer, the 0.5 mm volume covers two,
    // and the in-plane selection is identical in both.
    const { tool: thickTool } = createTool({ storePointData: true });
    const { tool: thinTool } = createTool({ storePointData: true });

    const inPlaneOf = (points) =>
      new Set(points.map(({ pointIJK }) => `${pointIJK[0]},${pointIJK[1]}`));

    const thick = thickTool.sampleVoxelsInContour({
      annotation: createAnnotation(1),
      points: SQUARE,
      imageData: createImageData([1, 1, 1], [8, 8, 8]),
      voxelManager,
    });

    const thin = thinTool.sampleVoxelsInContour({
      annotation: createAnnotation(1),
      points: SQUARE,
      imageData: createImageData([1, 1, 0.5], [8, 8, 8]),
      voxelManager,
    });

    expect(thick).toHaveLength(9);
    expect(thin).toHaveLength(18);
    expect(inPlaneOf(thin)).toEqual(inPlaneOf(thick));
  });

  it('reports voxel centres in world coordinates', () => {
    const { tool } = createTool({ storePointData: true });

    const points = tool.sampleVoxelsInContour({
      annotation: createAnnotation(0.2),
      points: SQUARE,
      imageData: createImageData([1, 1, 0.5], [8, 8, 8]),
      voxelManager,
    });

    // Identity direction, unit in-plane spacing, origin at zero, so a voxel
    // centre's world position is its index in x and y.
    for (const { pointIJK, pointLPS } of points) {
      expect(pointLPS[0]).toBeCloseTo(pointIJK[0]);
      expect(pointLPS[1]).toBeCloseTo(pointIJK[1]);
      expect(pointLPS[2]).toBeCloseTo(pointIJK[2] * 0.5);
    }
  });

  it('returns nothing when the volume carries no voxels for the contour', () => {
    const { tool, statsCallback } = createTool({ storePointData: true });

    const points = tool.sampleVoxelsInContour({
      annotation: createAnnotation(0.2),
      points: SQUARE,
      imageData: createImageData([1, 1, 0.5], [8, 8, 8]),
      voxelManager: { getAtIJKPoint: () => undefined },
    });

    expect(points).toHaveLength(0);
    expect(statsCallback).not.toHaveBeenCalled();
  });
});
