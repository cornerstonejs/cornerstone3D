import {
  RenderingEngine,
  Enums,
  cache,
  volumeLoader,
  setUseCPURendering,
} from '@cornerstonejs/core';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
} from '@jest/globals';
import IslandRemoval from '../../../src/utilities/segmentation/floodFillIslandRemoval';

const { OrientationAxis, ViewportType } = Enums;

const dimensions = [32, 32, 5];
const [width, height, depth] = dimensions;
const imageSize = width * height * depth;
const viewportId = 'viewportId';
const renderingEngineId = 'renderingEngineId';
const volumeId = 'volumeId';

describe('floodFillIslandRemoval internal fill tracking', function () {
  let islandRemoval, segmentationVoxels, renderingEngine, viewport;

  beforeAll(() => {
    window.devicePixelRatio = 1;
    setUseCPURendering(true);
  });

  beforeEach(() => {
    cache.purgeCache();
    islandRemoval = new IslandRemoval();
    const scalarData = new Uint8Array(imageSize);

    const volume = volumeLoader.createLocalVolume(volumeId, {
      dimensions,
      spacing: [1, 1, 1],
      scalarData,
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
    });

    segmentationVoxels = volume.voxelManager;

    renderingEngine = new RenderingEngine(renderingEngineId);
    createViewport(renderingEngine, OrientationAxis.ACQUISITION, width, height);
    viewport = renderingEngine.getViewport(viewportId);
  });

  afterEach(() => {
    cache.purgeCache();
    renderingEngine?.destroy();
  });

  it('reports exactly the hole voxels removeInternalIslands painted', () => {
    const x = 10;
    const y = 10;
    const z = 2;
    const w = 5;
    const h = 5;

    createBox(segmentationVoxels, 1, x, y, z, w, h);
    // A pre-existing same-segment voxel elsewhere on the slice must NOT be
    // reported — the tracking is by painted point, not by slice value-scan.
    segmentationVoxels.setAtIJK(2, 2, z, 1);

    const initialized = islandRemoval.initialize(viewport, segmentationVoxels, {
      segmentIndex: 1,
      points: [[x, y, z]],
    });
    expect(initialized).toBe(true);
    islandRemoval.floodFillSegmentIsland();
    expect(islandRemoval.getInternalFilledPoints()).toEqual([]);

    islandRemoval.removeInternalIslands();

    // 5x5 outline encloses a 3x3 hole.
    const filled = islandRemoval.getInternalFilledPoints();
    expect(filled.length).toBe((w - 2) * (h - 2));
    for (const point of filled) {
      expect(point[0]).toBeGreaterThan(x);
      expect(point[0]).toBeLessThan(x + w - 1);
      expect(point[1]).toBeGreaterThan(y);
      expect(point[1]).toBeLessThan(y + h - 1);
      expect(point[2]).toBe(z);
      expect(segmentationVoxels.getAtIJKPoint(point)).toBe(1);
    }
  });
});

function createBox(voxels, segmentIndex, x = 10, y = 10, z = 2, w = 5, h = 5) {
  for (let dx = 0; dx < w; dx++) {
    voxels.setAtIJK(x + dx, y, z, segmentIndex);
    voxels.setAtIJK(x + dx, y + h - 1, z, segmentIndex);
  }
  for (let dy = 0; dy < h; dy++) {
    voxels.setAtIJK(x, y + dy, z, segmentIndex);
    voxels.setAtIJK(x + w - 1, y + dy, z, segmentIndex);
  }
}

function createViewport(renderingEngine, _orientation, width, height) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return element;
}
