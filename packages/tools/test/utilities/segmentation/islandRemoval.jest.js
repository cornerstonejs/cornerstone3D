import {
  RenderingEngine,
  utilities,
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
import IslandRemoval from '../../../src/utilities/segmentation/islandRemoval';

const { OrientationAxis, ViewportType } = Enums;
const { VoxelManager } = utilities;

const dimensions = [32, 32, 5];
const [width, height, depth] = dimensions;
const imageSize = width * height * depth;
const viewportId = 'viewportId';
const renderingEngineId = 'renderingEngineId';
const volumeId = 'volumeId';

describe('IslandRemove', function () {
  let islandRemoval, segmentationVoxels, renderingEngine, viewport;
  let previewVoxels;

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
    previewVoxels =
      VoxelManager.createRLEHistoryVoxelManager(segmentationVoxels);
  });

  afterEach(() => {
    cache.purgeCache();
    renderingEngine?.destroy();
  });

  it('fills center', () => {
    expect(islandRemoval).not.toBeUndefined();
    const x = 10;
    const y = 10;
    const z = 2;
    const w = 5;
    const h = 5;

    createBox(segmentationVoxels, 1, x, y, z, w, h);
    const initialized = islandRemoval.initialize(viewport, segmentationVoxels, {
      segmentIndex: 1,
      points: [[x, y, z]],
    });
    expect(initialized).toBe(true);
    const floodedCount = islandRemoval.floodFillSegmentIsland();
    expect(floodedCount).toBe((w - 1) * (h - 1));
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(1);
    expect(segmentationVoxels.getAtIJK(x + 1, y + 1, z)).toBe(0);
    islandRemoval.removeInternalIslands();
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(1);
    expect(segmentationVoxels.getAtIJK(x + 1, y + 1, z)).toBe(1);
  });

  it('fills center preview', () => {
    expect(islandRemoval).not.toBeUndefined();
    const x = 10;
    const y = 10;
    const z = 2;
    const w = 5;
    const h = 5;
    const previewSegmentIndex = 255;
    const segmentIndex = 1;

    createBox(previewVoxels, previewSegmentIndex, x, y, z, w, h);
    const initialized = islandRemoval.initialize(viewport, previewVoxels, {
      segmentIndex,
      previewSegmentIndex,
      points: [[x, y, z]],
    });
    expect(initialized).toBe(true);
    const floodedCount = islandRemoval.floodFillSegmentIsland();
    expect(floodedCount).toBe((w - 1) * (h - 1));
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(255);
    expect(segmentationVoxels.getAtIJK(x + 1, y + 1, z)).toBe(0);
    islandRemoval.removeInternalIslands();
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(255);
    expect(segmentationVoxels.getAtIJK(x + 1, y + 1, z)).toBe(255);
  });

  it('deletes externals', () => {
    expect(islandRemoval).not.toBeUndefined();
    const x = 10;
    const y = 10;
    const z = 2;
    const w = 5;
    const h = 5;

    createBox(segmentationVoxels, 1, x, y, z, w, h);
    createBox(segmentationVoxels, 1, x - 5, y, z, 2, 2);

    const initialized = islandRemoval.initialize(viewport, segmentationVoxels, {
      segmentIndex: 1,
      points: [[x, y, z]],
    });
    expect(initialized).toBe(true);
    const floodedCount = islandRemoval.floodFillSegmentIsland();
    expect(floodedCount).toBe((w - 1) * (h - 1));
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(1);
    expect(segmentationVoxels.getAtIJK(x - 5, y, z)).toBe(1);
    islandRemoval.removeExternalIslands();
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(1);
    expect(segmentationVoxels.getAtIJK(x - 5, y, z)).toBe(0);
  });

  it('deletes preview externals', () => {
    const x = 10;
    const y = 10;
    const z = 2;
    const w = 5;
    const h = 5;
    const previewSegmentIndex = 255;
    const segmentIndex = 1;

    createBox(previewVoxels, previewSegmentIndex, x, y, z, w, h);
    createBox(previewVoxels, previewSegmentIndex, x - 5, y, z, 2, 2);

    const initialized = islandRemoval.initialize(viewport, segmentationVoxels, {
      segmentIndex,
      previewSegmentIndex,
      points: [
        [x, y, z],
        [x + 1, y, z],
        [x, y + 1, z],
      ],
    });
    expect(initialized).toBe(true);
    const floodedCount = islandRemoval.floodFillSegmentIsland();
    expect(floodedCount).toBe((w - 1) * (h - 1));
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(previewSegmentIndex);
    expect(segmentationVoxels.getAtIJK(x - 5, y, z)).toBe(previewSegmentIndex);
    islandRemoval.removeExternalIslands();
    expect(segmentationVoxels.getAtIJK(x, y + 1, z)).toBe(previewSegmentIndex);
    expect(segmentationVoxels.getAtIJK(x - 5, y, z)).toBe(0);
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
