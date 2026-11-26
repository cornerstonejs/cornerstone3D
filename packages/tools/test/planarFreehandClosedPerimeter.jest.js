import PlanarFreehandROITool from '../src/tools/annotation/PlanarFreehandROITool';

/** An image data of voxels of 1 mm whose index is the world point. */
function createImage() {
  return {
    dimensions: [10, 10, 1],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    imageData: { worldToIndex: ([x, y, z]) => [x, y, z] },
    worldToIndex: ([x, y, z]) => [x, y, z],
  };
}

const SQUARE = [
  [1, 1, 0],
  [3, 1, 0],
  [3, 3, 0],
  [1, 3, 0],
];

describe('The perimeter of a closed freehand contour', () => {
  it('counts the segment from the last point back to the first', () => {
    const tool = new PlanarFreehandROITool();
    const cachedStats = {};

    tool.configuration.statsCalculator = {
      statsCallback: () => undefined,
      getStatistics: () => ({ array: [] }),
    };
    tool.updateClosedCachedStats({
      points: SQUARE,
      imageData: createImage(),
      image: createImage(),
      metadata: { Modality: 'CT' },
      voxelManager: { getAtIJKPoint: () => 0 },
      cachedStats,
      targetId: 'target',
      modalityUnit: 'HU',
      canvasCoordinates: SQUARE.map(([x, y]) => [x, y]),
      calibratedScale: { scale: 1, unit: 'mm', areaUnit: 'mm²' },
      deltaInX: 1,
      deltaInY: 1,
      annotation: {
        metadata: {
          viewPlaneNormal: [0, 0, 1],
          planeRestriction: { referencePlaneThickness: 1 },
        },
      },
    });

    expect(cachedStats.target.perimeter).toBe(8);
    expect(cachedStats.target.area).toBe(4);
  });
});
