jest.mock('@cornerstonejs/core', () => {
  return {
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
      viewportIsInVolumeMode: jest.requireActual(
        '../../core/src/utilities/viewportCapabilities'
      ).viewportIsInVolumeMode,
    },
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
  volumeId,
  type,
  getCurrentMode,
} = {}) {
  return {
    type,
    getCurrentMode,
    element: document.createElement('div'),
    getCurrentImageIdIndex: jest.fn(() => currentImageIdIndex),
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
      getCurrentMode: () => 'stack',
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
      getCurrentMode: () => 'volume',
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

  it('reverses target indices for planar viewports that sample their slice on the CPU', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport({
      currentImageIdIndex: 0,
      getCurrentMode: () => 'volume',
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

  it('reverses target indices for a planar viewport in volume mode', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport({
      currentImageIdIndex: 0,
      type: 'planar',
      getCurrentMode: () => 'volume',
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
      getCurrentMode: () => 'volume',
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

  it('reads the source from its own rendering engine when the target is in another one', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport();
    const engines = {
      engineA: {
        getViewport: (id) => (id === 'source' ? sourceViewport : undefined),
      },
      engineB: {
        getViewport: (id) => (id === 'target' ? targetViewport : undefined),
      },
    };

    getRenderingEngine.mockImplementation((id) => engines[id]);

    await imageSliceSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'engineA', viewportId: 'source' },
      { renderingEngineId: 'engineB', viewportId: 'target' }
    );

    expect(utilities.jumpToSlice).toHaveBeenCalledWith(targetViewport.element, {
      imageIndex: 2,
    });
  });

  it('does nothing, and does not throw, when the source or the target viewport is disabled', async () => {
    const sourceViewport = createSourceViewport('image:2');
    const targetViewport = createTargetViewport();

    for (const [source, target] of [
      [undefined, targetViewport],
      [sourceViewport, undefined],
    ]) {
      mockRenderingEngine(source, target);

      await expect(
        imageSliceSyncCallback(
          createSynchronizerInstance(),
          { renderingEngineId: 'rendering-engine', viewportId: 'source' },
          { renderingEngineId: 'rendering-engine', viewportId: 'target' }
        )
      ).resolves.toBeUndefined();
    }

    expect(utilities.jumpToSlice).not.toHaveBeenCalled();
  });

  it('recalculates the registration when the target shows a different frame of reference', async () => {
    const coreMetaData = jest.requireActual('../../core/src/metaData');
    const renderingEngineCache = jest.requireActual(
      '../../core/src/RenderingEngine/renderingEngineCache'
    ).default;
    const actualProvider = jest.requireActual(
      '../../core/src/utilities/spatialRegistrationMetadataProvider'
    ).default;
    const actualCalculate = jest.requireActual(
      '../../core/src/utilities/calculateViewportsSpatialRegistration'
    ).default;
    const {
      calculateViewportsSpatialRegistration,
      spatialRegistrationMetadataProvider,
    } = utilities;
    const sourceViewport = Object.assign(createSourceViewport('image:2'), {
      id: 'source',
      renderingEngineId: 'rendering-engine',
    });
    const targetViewport = Object.assign(createTargetViewport(), {
      id: 'target',
      renderingEngineId: 'rendering-engine',
      getCurrentImageId: jest.fn(() => 'image:0'),
    });
    const renderingEngine = {
      id: 'rendering-engine',
      getViewport: (viewportId) =>
        viewportId === 'source' ? sourceViewport : targetViewport,
    };
    const imagePlaneProvider = (type, imageId) =>
      type === 'imagePlaneModule' && imagePositions.has(imageId)
        ? {
            imagePositionPatient: imagePositions.get(imageId),
            imageOrientationPatient: [1, 0, 0, 0, 1, 0],
          }
        : undefined;

    targetViewport.getFrameOfReferenceUID.mockReturnValue('other-for-1');
    getRenderingEngine.mockReturnValue(renderingEngine);
    renderingEngineCache.set(renderingEngine);
    coreMetaData.addProvider(imagePlaneProvider, 10000);
    calculateViewportsSpatialRegistration.mockImplementation(actualCalculate);
    spatialRegistrationMetadataProvider.get.mockImplementation(
      actualProvider.get
    );

    const sync = () =>
      imageSliceSyncCallback(
        createSynchronizerInstance(),
        { renderingEngineId: 'rendering-engine', viewportId: 'source' },
        { renderingEngineId: 'rendering-engine', viewportId: 'target' }
      );

    try {
      await sync();
      await sync();
      expect(calculateViewportsSpatialRegistration).toHaveBeenCalledTimes(1);
      expect(utilities.jumpToSlice).not.toHaveBeenCalled();

      targetViewport.getFrameOfReferenceUID.mockReturnValue('other-for-2');
      targetViewport.getCurrentImageId.mockReturnValue('image:3');
      await sync();

      expect(calculateViewportsSpatialRegistration).toHaveBeenCalledTimes(2);
      expect(utilities.jumpToSlice).toHaveBeenCalledWith(
        targetViewport.element,
        { imageIndex: 3 }
      );
    } finally {
      coreMetaData.removeProvider(imagePlaneProvider);
      renderingEngineCache.delete('rendering-engine');
      calculateViewportsSpatialRegistration.mockReset();
      spatialRegistrationMetadataProvider.get.mockReset();
    }
  });
});
