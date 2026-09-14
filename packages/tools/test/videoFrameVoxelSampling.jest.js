import { utilities } from '@cornerstonejs/core';
import CircleROITool from '../src/tools/annotation/CircleROITool';
import { BasicStatsCalculator } from '../src/utilities/math/basic';

const { VoxelManager } = utilities;

/**
 * A video viewport measures the frame it displays. `VideoViewport.getImageData`
 * builds a voxel manager over the RGBA pixels of that frame, and these tests
 * pin what the area annotation tools then read: a value per pixel through
 * `getAtIJKPoint`, and statistics for each of the three colour channels.
 *
 * An earlier shim carried `forEach` alone, and the shared sampler threw
 * `voxelManager.getAtIJKPoint is not a function` inside the render loop.
 */
describe('Video frame voxel sampling', () => {
  const targetId = 'imageId:test';
  const width = 40;
  const height = 40;

  /** Red rises with i, green rises with j, blue is flat, alpha is opaque. */
  function createFrameData() {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const offset = (j * width + i) * 4;
        data[offset] = i;
        data[offset + 1] = j;
        data[offset + 2] = 7;
        data[offset + 3] = 255;
      }
    }
    return data;
  }

  /** What `VideoViewport.getImageData` returns for the frame on display. */
  function createImage(scalarData = createFrameData()) {
    return {
      dimensions: [width, height, 1],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      hasPixelSpacing: true,
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y, z],
      },
      metadata: { Modality: 'US' },
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions: [width, height, 1],
        scalarData,
        numberOfComponents: 4,
      }),
    };
  }

  /** A circle of radius 5 mm centred on (20, 20, 0), simplified handles. */
  function createAnnotation() {
    return {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [20, 20, 0],
            [20, 15, 0],
          ],
        },
      },
      invalidated: false,
      metadata: { viewPlaneNormal: [0, 0, 1] },
    };
  }

  function createViewport() {
    return {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
      canvasToWorld: ([x, y]) => [x, y, 0],
    };
  }

  function createTool(image) {
    const tool = new CircleROITool();
    tool.getTargetImageData = () => image;
    BasicStatsCalculator.statsInit({ storePointData: false });
    return tool;
  }

  it('reads the RGBA pixels of the frame through the voxel manager', () => {
    const image = createImage();
    const tool = createTool(image);
    const annotation = createAnnotation();

    expect(() =>
      tool._calculateCachedStats(annotation, createViewport(), {}, {})
    ).not.toThrow();

    const { mean, max, min } = annotation.data.cachedStats[targetId];

    // One statistic per colour channel, as a colour image also reports.
    expect(mean).toHaveLength(3);

    // Red rises with i and green with j, and the disc is centred on (20, 20),
    // so both channels average 20. Blue is flat.
    expect(mean[0]).toBeCloseTo(20, 6);
    expect(mean[1]).toBeCloseTo(20, 6);
    expect(mean[2]).toBeCloseTo(7, 6);

    // The disc reaches 5 voxels from the centre along both axes.
    expect(max).toEqual([25, 25, 7]);
    expect(min).toEqual([15, 15, 7]);
  });

  it('measures nothing when the frame has no pixels', () => {
    // `VideoViewport.getFrameVoxelManager` returns undefined before the first
    // frame arrives. The sampler must then reach no voxel at all, rather than
    // throw inside the render loop.
    const image = createImage();
    image.voxelManager = undefined;

    const statsCallback = jest.fn();
    const tool = new CircleROITool();
    tool.getTargetImageData = () => image;
    tool.configuration.statsCalculator = {
      getStatistics: () => ({ array: [] }),
      statsCallback,
    };

    expect(() =>
      tool._calculateCachedStats(createAnnotation(), createViewport(), {}, {})
    ).not.toThrow();

    expect(statsCallback).not.toHaveBeenCalled();
  });
});
