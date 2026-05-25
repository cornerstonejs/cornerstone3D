jest.mock('@cornerstonejs/core', () => {
  class VolumeViewport {}

  return {
    ActorRenderMode: {
      CPU_IMAGE: 'cpuImage',
      CPU_VOLUME: 'cpuVolume',
      VTK_VOLUME_SLICE: 'vtkVolumeSlice',
    },
    getRenderingEngine: jest.fn(),
    metaData: {
      get: jest.fn(),
    },
    utilities: {
      calculateViewportsSpatialRegistration: jest.fn(),
      jumpToSlice: jest.fn(),
      spatialRegistrationMetadataProvider: {
        get: jest.fn(),
      },
    },
    VolumeViewport,
  };
});

jest.mock('../src/synchronizers/callbacks/areViewportsCoplanar', () =>
  jest.fn(() => true)
);

import { getRenderingEngine, metaData, utilities } from '@cornerstonejs/core';
import imageSliceSyncCallback from '../src/synchronizers/callbacks/imageSliceSyncCallback';

const imageIds = ['image:0', 'image:1', 'image:2', 'image:3'];
const imagePositions = new Map(
  imageIds.map((imageId, index) => [imageId, [0, 0, index]])
);

function createSourceViewport(imageId = 'image:2') {
  return {
    getCurrentImageId: jest.fn(() => imageId),
    getFrameOfReferenceUID: jest.fn(() => 'frame-of-reference'),
    getImageIds: jest.fn(() => imageIds),
  };
}

function createTargetViewport({
  currentImageIdIndex = 0,
  renderMode,
  volumeId,
} = {}) {
  return {
    element: document.createElement('div'),
    getCurrentImageIdIndex: jest.fn(() => currentImageIdIndex),
    getDefaultActor:
      renderMode === undefined
        ? undefined
        : jest.fn(() => ({
            actorMapper: {
              renderMode,
            },
          })),
    getFrameOfReferenceUID: jest.fn(() => 'frame-of-reference'),
    getImageIds: jest.fn(() => imageIds),
    getVolumeId: volumeId === undefined ? undefined : jest.fn(() => volumeId),
  };
}

function createSynchronizerInstance() {
  return {
    getOptions: jest.fn(() => undefined),
  };
}

function mockRenderingEngine(sourceViewport, targetViewport) {
  getRenderingEngine.mockReturnValue({
    getViewport: jest.fn((viewportId) =>
      viewportId === 'source' ? sourceViewport : targetViewport
    ),
  });
}

describe('imageSliceSyncCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    metaData.get.mockImplementation((_type, imageId) => ({
      imagePositionPatient: imagePositions.get(imageId),
    }));
    utilities.spatialRegistrationMetadataProvider.get.mockReturnValue(
      undefined
    );
  });

  it('keeps stack targets in imageId index order', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport();

    mockRenderingEngine(sourceViewport, targetViewport);

    await imageSliceSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'rendering-engine', viewportId: 'source' },
      { renderingEngineId: 'rendering-engine', viewportId: 'target' }
    );

    expect(utilities.jumpToSlice).toHaveBeenCalledWith(targetViewport.element, {
      imageIndex: 2,
    });
  });

  it('keeps planar image-rendering stack targets in imageId order even when they expose a volume id', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport({
      renderMode: 'cpuImage',
      volumeId: 'generated-volume-id',
    });

    mockRenderingEngine(sourceViewport, targetViewport);

    await imageSliceSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'rendering-engine', viewportId: 'source' },
      { renderingEngineId: 'rendering-engine', viewportId: 'target' }
    );

    expect(utilities.jumpToSlice).toHaveBeenCalledWith(targetViewport.element, {
      imageIndex: 2,
    });
  });

  it('reverses target indices for volume-backed planar viewports', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport({
      currentImageIdIndex: 0,
      renderMode: 'cpuVolume',
      volumeId: 'volume-id',
    });

    mockRenderingEngine(sourceViewport, targetViewport);

    await imageSliceSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'rendering-engine', viewportId: 'source' },
      { renderingEngineId: 'rendering-engine', viewportId: 'target' }
    );

    expect(utilities.jumpToSlice).toHaveBeenCalledWith(targetViewport.element, {
      imageIndex: 1,
    });
  });

  it('does not jump volume-backed planar targets already on the reversed index', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport({
      currentImageIdIndex: 1,
      renderMode: 'cpuVolume',
      volumeId: 'volume-id',
    });

    mockRenderingEngine(sourceViewport, targetViewport);

    await imageSliceSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'rendering-engine', viewportId: 'source' },
      { renderingEngineId: 'rendering-engine', viewportId: 'target' }
    );

    expect(utilities.jumpToSlice).not.toHaveBeenCalled();
  });
});
