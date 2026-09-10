import CircleROITool from '../src/tools/annotation/CircleROITool';

/**
 * Circle ROI selects its voxels through the shared area annotation sampler, so
 * the selection is a circle in the annotation plane and not an axis-aligned
 * ellipsoid in world coordinates. These tests pin the voxel set, and not the
 * area, which the tool computes from the handles separately.
 */
describe('Circle ROI voxel sampling', () => {
  const targetId = 'imageId:test';

  /** 40x40x1 voxels of 1x1x1 mm, unrotated, so voxel (i, j, k) is at (i, j, k). */
  function createImage() {
    return {
      dimensions: [40, 40, 1],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      hasPixelSpacing: true,
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y, z],
      },
      metadata: { Modality: 'CT' },
      voxelManager: { getAtIJKPoint: () => 1 },
    };
  }

  /** A circle of radius 5 mm centred on (20, 20, 0), with cardinal handles. */
  function createAnnotation() {
    return {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [20, 20, 0],
            [20, 15, 0],
            [20, 25, 0],
            [15, 20, 0],
            [25, 20, 0],
          ],
        },
      },
      invalidated: false,
      metadata: { viewPlaneNormal: [0, 0, 1] },
    };
  }

  /** The canvas is the world in x and y, which keeps the fixture readable. */
  function createViewport() {
    return {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
      canvasToWorld: ([x, y]) => [x, y, 0],
    };
  }

  function createTool(statsCallback) {
    const tool = new CircleROITool();
    tool.getTargetImageData = () => createImage();
    tool.configuration.statsCalculator = {
      getStatistics: () => ({ array: [] }),
      statsCallback,
    };
    return tool;
  }

  it('selects the voxel centres inside the circle, and no others', () => {
    const statsCallback = jest.fn();
    const tool = createTool(statsCallback);

    tool._calculateCachedStats(createAnnotation(), createViewport(), {}, {});

    const indices = statsCallback.mock.calls.map(([{ pointIJK }]) => pointIJK);
    expect(indices.length).toBeGreaterThan(0);

    // Every selected centre lies within the radius, and the count matches the
    // integer lattice points of a disc of radius 5.
    for (const [i, j, k] of indices) {
      const distance = Math.hypot(i - 20, j - 20);
      expect(distance).toBeLessThanOrEqual(5 + 1e-6);
      expect(k).toBe(0);
    }

    let expected = 0;
    for (let i = 15; i <= 25; i++) {
      for (let j = 15; j <= 25; j++) {
        if (Math.hypot(i - 20, j - 20) <= 5 + 1e-6) {
          expected++;
        }
      }
    }
    expect(indices).toHaveLength(expected);
  });

  it('selects the same voxels whatever the canvas scale', () => {
    // The selection must be a property of the annotation and the data. A
    // canvas that is twice the size must not change the voxel set.
    const atOneScale = jest.fn();
    const atTwoScale = jest.fn();

    createTool(atOneScale)._calculateCachedStats(
      createAnnotation(),
      createViewport(),
      {},
      {}
    );

    createTool(atTwoScale)._calculateCachedStats(
      createAnnotation(),
      {
        element: document.createElement('div'),
        worldToCanvas: ([x, y]) => [x * 2, y * 2],
        canvasToWorld: ([x, y]) => [x / 2, y / 2, 0],
      },
      {},
      {}
    );

    const indicesOf = (mock) =>
      mock.mock.calls.map(([{ pointIJK }]) => pointIJK.join(','));

    expect(indicesOf(atOneScale).length).toBeGreaterThan(0);
    expect(indicesOf(atTwoScale)).toEqual(indicesOf(atOneScale));
  });
});
