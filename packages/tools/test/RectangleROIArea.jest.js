import RectangleROITool from '../src/tools/annotation/RectangleROITool';

describe('Rectangle ROI area', () => {
  it('uses continuous indices for physical area', () => {
    const tool = new RectangleROITool();
    const targetId = 'imageId:test';
    const forEach = jest.fn();
    const image = {
      dimensions: [100, 100, 1],
      hasPixelSpacing: true,
      imageData: {
        worldToIndex: ([x, y, z]) => [x / 5, y / 5, z],
      },
      metadata: { Modality: 'CT' },
      spacing: [5, 5, 1],
      voxelManager: { forEach },
    };
    const annotation = {
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
      metadata: {},
    };
    const viewport = {
      element: document.createElement('div'),
    };

    tool.getTargetImageData = () => image;
    tool.configuration.statsCalculator = {
      getStatistics: () => ({ array: [] }),
      statsCallback: jest.fn(),
    };

    tool._calculateCachedStats(
      annotation,
      [0, 0, 1],
      [0, 1, 0],
      {},
      { viewport }
    );

    expect(annotation.data.cachedStats[targetId].area).toBeCloseTo(27 * 16);
    expect(forEach).toHaveBeenCalledWith(
      tool.configuration.statsCalculator.statsCallback,
      expect.objectContaining({
        boundsIJK: [
          [0, 6],
          [0, 4],
          [0, 0],
        ],
      })
    );
  });
});
