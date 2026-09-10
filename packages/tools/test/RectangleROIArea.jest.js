import RectangleROITool from '../src/tools/annotation/RectangleROITool';

describe('Rectangle ROI area', () => {
  const targetId = 'imageId:test';

  /**
   * A 100x100x1 volume of 5x5x1 mm voxels, with no rotation, so voxel (i, j, k)
   * sits at world (5i, 5j, k).
   */
  function createImage(statsCallback) {
    return {
      dimensions: [100, 100, 1],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing: [5, 5, 1],
      hasPixelSpacing: true,
      imageData: {
        worldToIndex: ([x, y, z]) => [x / 5, y / 5, z],
      },
      metadata: { Modality: 'CT' },
      voxelManager: { getAtIJKPoint: () => 1, forEach: statsCallback },
    };
  }

  /** Corners 0 and 3 are opposite, so the rectangle is 27 mm by 16 mm. */
  function createAnnotation() {
    return {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [2, 2, 0],
            [29, 2, 0],
            [2, 18, 0],
            [29, 18, 0],
          ],
        },
      },
      invalidated: false,
      metadata: { viewPlaneNormal: [0, 0, 1] },
    };
  }

  function createTool(statsCallback) {
    const tool = new RectangleROITool();
    tool.getTargetImageData = () => createImage(statsCallback);
    tool.configuration.statsCalculator = {
      getStatistics: () => ({ array: [] }),
      statsCallback,
    };
    return tool;
  }

  it('uses continuous indices for physical area', () => {
    const tool = createTool(jest.fn());
    const annotation = createAnnotation();

    tool._calculateCachedStats(annotation, [0, 0, 1], [0, 1, 0], {
      viewport: { element: document.createElement('div') },
    });

    expect(annotation.data.cachedStats[targetId].area).toBeCloseTo(27 * 16);
  });

  it('samples only the voxel centres inside the rectangle', () => {
    // The rectangle spans 2..29 mm in x and 2..18 mm in y. Voxel centres sit
    // at multiples of 5 mm, so i covers 1..5 and j covers 1..3, and the count
    // is 15. The older traversal walked the index bounding box and applied no
    // shape test, so it also counted the voxels outside the rectangle.
    const statsCallback = jest.fn();
    const tool = createTool(statsCallback);

    tool._calculateCachedStats(createAnnotation(), [0, 0, 1], [0, 1, 0], {
      viewport: { element: document.createElement('div') },
    });

    expect(statsCallback).toHaveBeenCalledTimes(15);

    const indices = statsCallback.mock.calls.map(([{ pointIJK }]) => pointIJK);
    expect([...new Set(indices.map(([i]) => i))].sort()).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect([...new Set(indices.map(([, j]) => j))].sort()).toEqual([1, 2, 3]);
    expect([...new Set(indices.map(([, , k]) => k))]).toEqual([0]);
  });

  it('samples an annotation that records a plane restriction and no normal', () => {
    // A measurement that arrives from a DICOM SR has no recorded normal,
    // because an SR stores no camera. The hydration code records two in-plane
    // vectors instead, and those two describe the same plane.
    const withNormal = jest.fn();
    const fromRestriction = jest.fn();

    createTool(withNormal)._calculateCachedStats(
      createAnnotation(),
      [0, 0, 1],
      [0, 1, 0],
      { viewport: { element: document.createElement('div') } }
    );

    const hydrated = createAnnotation();
    hydrated.metadata = {
      viewPlaneNormal: null,
      viewUp: null,
      FrameOfReferenceUID: 'FOR',
      planeRestriction: {
        FrameOfReferenceUID: 'FOR',
        point: hydrated.data.handles.points[0],
        inPlaneVector1: [1, 0, 0],
        inPlaneVector2: [0, 1, 0],
      },
    };

    createTool(fromRestriction)._calculateCachedStats(
      hydrated,
      [0, 0, 1],
      [0, 1, 0],
      { viewport: { element: document.createElement('div') } }
    );

    const indicesOf = (mock) =>
      mock.mock.calls.map(([{ pointIJK }]) => pointIJK.join(','));

    expect(indicesOf(withNormal)).toHaveLength(15);
    expect(indicesOf(fromRestriction)).toEqual(indicesOf(withNormal));
  });

  it('reports no voxels for a rectangle of no width', () => {
    // The shape factory rejects a zero half length, and an exception inside
    // the render loop would stop the whole viewport.
    const statsCallback = jest.fn();
    const tool = createTool(statsCallback);
    const annotation = createAnnotation();
    annotation.data.handles.points = [
      [2, 2, 0],
      [2, 2, 0],
      [2, 18, 0],
      [2, 18, 0],
    ];

    expect(() =>
      tool._calculateCachedStats(annotation, [0, 0, 1], [0, 1, 0], {
        viewport: { element: document.createElement('div') },
      })
    ).not.toThrow();

    expect(statsCallback).not.toHaveBeenCalled();
  });
});
