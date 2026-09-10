import EllipticalROITool from '../src/tools/annotation/EllipticalROITool';

/**
 * Elliptical ROI selects its voxels through the shared area annotation
 * sampler, so the selection is an ellipse in the annotation plane and not an
 * ellipsoid aligned with the world axes. These tests pin the voxel set, and
 * not the area, which the tool computes from the handles separately.
 */
describe('Elliptical ROI voxel sampling', () => {
  const targetId = 'imageId:test';

  /** 40x40x1 voxels, unrotated, so voxel (i, j, k) sits at (i * sx, j * sy, k). */
  function createImage(spacing = [1, 1, 1]) {
    return {
      dimensions: [40, 40, 1],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing,
      hasPixelSpacing: true,
      imageData: {
        worldToIndex: ([x, y, z]) => [x / spacing[0], y / spacing[1], z],
      },
      metadata: { Modality: 'CT' },
      voxelManager: { getAtIJKPoint: () => 1 },
    };
  }

  /**
   * Handles are [bottom, top, left, right]. Centred on (20, 20, 0), with a
   * half width of 8 mm and a half height of 4 mm.
   */
  function createAnnotation() {
    return {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [20, 16, 0],
            [20, 24, 0],
            [12, 20, 0],
            [28, 20, 0],
          ],
        },
      },
      invalidated: false,
      metadata: { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] },
    };
  }

  function createViewport() {
    return {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
      canvasToWorld: ([x, y]) => [x, y, 0],
      // The tool derives the in-plane width and height from the camera.
      getViewReference: () => ({
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, -1, 0],
        cameraFocalPoint: [20, 20, 0],
      }),
      getCamera: () => ({
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, -1, 0],
        focalPoint: [20, 20, 0],
        position: [20, 20, -1],
      }),
    };
  }

  function createTool(statsCallback, spacing) {
    const tool = new EllipticalROITool();
    tool.getTargetImageData = () => createImage(spacing);
    tool.configuration.statsCalculator = {
      getStatistics: () => ({ array: [] }),
      statsCallback,
    };
    return tool;
  }

  function sample(statsCallback, spacing) {
    createTool(statsCallback, spacing)._calculateCachedStats(
      createAnnotation(),
      createViewport(),
      {},
      {}
    );
    return statsCallback.mock.calls.map(([{ pointIJK }]) => pointIJK);
  }

  it('selects the voxel centres inside the ellipse, and no others', () => {
    const indices = sample(jest.fn());

    expect(indices.length).toBeGreaterThan(0);

    // (x - 20)^2 / 8^2 + (y - 20)^2 / 4^2 <= 1, at 1 mm voxels.
    for (const [i, j, k] of indices) {
      const inside =
        ((i - 20) * (i - 20)) / 64 + ((j - 20) * (j - 20)) / 16 <= 1 + 1e-6;
      expect(inside).toBe(true);
      expect(k).toBe(0);
    }

    let expected = 0;
    for (let i = 12; i <= 28; i++) {
      for (let j = 16; j <= 24; j++) {
        if (
          ((i - 20) * (i - 20)) / 64 + ((j - 20) * (j - 20)) / 16 <=
          1 + 1e-6
        ) {
          expected++;
        }
      }
    }
    expect(indices).toHaveLength(expected);
  });

  it('follows the ellipse through anisotropic spacing', () => {
    // 2 mm voxels along y halve the number of rows the same ellipse covers,
    // and every selected centre still has to satisfy the world-space ellipse.
    const indices = sample(jest.fn(), [1, 2, 1]);

    expect(indices.length).toBeGreaterThan(0);

    for (const [i, j] of indices) {
      const worldX = i;
      const worldY = j * 2;
      const inside =
        ((worldX - 20) * (worldX - 20)) / 64 +
          ((worldY - 20) * (worldY - 20)) / 16 <=
        1 + 1e-6;
      expect(inside).toBe(true);
    }
  });

  it('reports no voxels for an ellipse of no height', () => {
    // The shape factory rejects a zero radius, and an exception inside the
    // render loop would stop the whole viewport.
    const statsCallback = jest.fn();
    const tool = createTool(statsCallback);
    const annotation = createAnnotation();
    annotation.data.handles.points[0] = [20, 20, 0];
    annotation.data.handles.points[1] = [20, 20, 0];

    expect(() =>
      tool._calculateCachedStats(annotation, createViewport(), {}, {})
    ).not.toThrow();

    expect(statsCallback).not.toHaveBeenCalled();
  });
});
