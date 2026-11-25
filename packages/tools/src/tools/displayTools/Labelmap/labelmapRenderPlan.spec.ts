jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    BlendModes: {
      LABELMAP_EDGE_PROJECTION_BLEND: 0,
      MAXIMUM_INTENSITY_BLEND: 1,
    },
    ViewportType: {
      PLANAR: 'planar',
    },
    VoxelStatistics: {
      Average: 'average',
      ForegroundMajority: 'foregroundMajority',
    },
  },
  cache: {
    getVolume: jest.fn(),
  },
  gpuSettingsForRender: jest.fn(),
  gridLimitsOfGpuSettings: jest.fn(() => ({})),
  utilities: (() => {
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLevel: jest.fn(),
    };
    return {
      logger: { toolsLog: { getLogger: jest.fn(() => logger) } },
      voxelGrid: { voxelGridWithinLimits: jest.fn(() => true) },
      uuidv4: jest.fn(() => 'generated-volume-id'),
    };
  })(),
  displaySetRegistry: {
    add: jest.fn(),
    remove: jest.fn(),
  },
  volumeLoader: {
    createAndCacheVolumeFromImages: jest.fn(),
  },
}));

jest.mock(
  '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport',
  () => ({
    getCurrentLabelmapImageIdsForViewport: jest.fn(),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/getSegmentationActor',
  () => ({
    getLabelmapActorEntries: jest.fn(),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode',
  () => ({
    __esModule: true,
    default: jest.fn(),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    canRenderVolumeViewportLabelmapAsImage: jest.fn(),
    getVolumeViewportLabelmapImageMapperState: jest.fn(() => ({
      key: 'unsupported:test',
      sliceIndex: NaN,
      supported: false,
    })),
    shouldUseSliceRendering: jest.fn(),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({
    getLabelmaps: jest.fn(() => []),
    getOrCreateLabelmapVolume: jest.fn(),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/triggerSegmentationEvents',
  () => ({
    triggerSegmentationDataModified: jest.fn(),
    triggerSegmentationModified: jest.fn(),
  })
);

jest.mock('./removeLabelmapRepresentationData', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./syncStackLabelmapActors', () => ({
  getCurrentStackLabelmapImages: jest.fn(),
  syncStackLabelmapActors: jest.fn(),
}));

jest.mock('./volumeLabelmapImageMapper', () => ({
  addVolumeLabelmapImageMapperActors: jest.fn(),
  getVolumeLabelmapImageMapperRepresentationUIDs: jest.fn(() => []),
  updateVolumeLabelmapImageMapperActors: jest.fn(),
}));

import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import {
  cache,
  Enums,
  gpuSettingsForRender,
  utilities,
} from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  canRenderVolumeViewportLabelmapAsImage,
  shouldUseSliceRendering,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import {
  getLabelmaps,
  getOrCreateLabelmapVolume,
} from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import removeLabelmapRepresentationData from './removeLabelmapRepresentationData';
import {
  getCurrentStackLabelmapImages,
  syncStackLabelmapActors,
} from './syncStackLabelmapActors';
import {
  addVolumeLabelmapImageMapperActors,
  getVolumeLabelmapImageMapperRepresentationUIDs,
} from './volumeLabelmapImageMapper';
import { resolveLabelmapRenderPlan } from './labelmapRenderPlan';

const getCurrentLabelmapImageIdsForViewportMock =
  getCurrentLabelmapImageIdsForViewport as jest.Mock;
const getVolumeMock = cache.getVolume as jest.Mock;
const getLabelmapActorEntriesMock = getLabelmapActorEntries as jest.Mock;
const getViewportLabelmapRenderModeMock =
  getViewportLabelmapRenderMode as jest.Mock;
const canRenderVolumeViewportLabelmapAsImageMock =
  canRenderVolumeViewportLabelmapAsImage as unknown as jest.Mock;
const getLabelmapsMock = getLabelmaps as jest.Mock;
const getOrCreateLabelmapVolumeMock = getOrCreateLabelmapVolume as jest.Mock;
const shouldUseSliceRenderingMock = shouldUseSliceRendering as jest.Mock;
const removeLabelmapRepresentationDataMock =
  removeLabelmapRepresentationData as jest.Mock;
const syncStackLabelmapActorsMock = syncStackLabelmapActors as jest.Mock;
const getCurrentStackLabelmapImagesMock =
  getCurrentStackLabelmapImages as jest.Mock;
const triggerSegmentationDataModifiedMock =
  triggerSegmentationDataModified as jest.Mock;

/**
 * A planar viewport in volume mode on the CPU volume path, with the members
 * that the volume labelmap plan calls, and the overlay actor of one labelmap
 * layer.
 */
function createPlanarVolumeViewport(labelmapId: string) {
  return {
    id: 'viewport-id',
    type: 'planar',
    addDisplaySet: jest.fn(),
    getActors: jest.fn(() => [
      {
        representationUID: `segmentation-id-Labelmap-${labelmapId}`,
        uid: 'overlay-actor',
        actor: {},
      },
    ]),
    getCurrentImageIdIndex: jest.fn(() => 0),
    getCurrentMode: jest.fn(() => 'volume'),
    getViewReference: jest.fn(() => ({ volumeId: 'source-volume-id' })),
    getViewState: jest.fn(() => ({ orientation: 'axial' })),
    getVolumeId: jest.fn(() => 'source-volume-id'),
    render: jest.fn(),
    setDisplaySetAppearance: jest.fn(),
    setViewReference: jest.fn(),
  };
}

describe('labelmapRenderPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canRenderVolumeViewportLabelmapAsImageMock.mockReturnValue(false);
    getCurrentLabelmapImageIdsForViewportMock.mockReturnValue([
      'derived-image-id',
    ]);
    getCurrentStackLabelmapImagesMock.mockReturnValue([
      {
        imageId: 'derived-image-id',
        representationUID: 'segmentation-id-Labelmap-layer-id-stack',
      },
    ]);
    getLabelmapsMock.mockReturnValue([]);
    getOrCreateLabelmapVolumeMock.mockReset();
    getVolumeMock.mockReset();
    getLabelmapActorEntriesMock.mockReturnValue([]);
    getViewportLabelmapRenderModeMock.mockReturnValue('image');
    removeLabelmapRepresentationDataMock.mockReturnValue(false);
    shouldUseSliceRenderingMock.mockReturnValue(false);
  });

  it('owns stack labelmap mount and expected actor UID behavior', async () => {
    const viewport = {
      id: 'viewport-id',
      type: 'planar',
    };
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: {
        Labelmap: {},
      },
    };

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: {} as never,
      },
    });

    expect(renderPlan.kind).toBe('legacy-stack-image');
    expect(renderPlan.getExpectedRepresentationUIDs()).toEqual([
      'segmentation-id-Labelmap-layer-id-stack',
    ]);

    await renderPlan.reconcile({
      actorEntries: [],
      labelMapData: {} as never,
    });

    expect(syncStackLabelmapActorsMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id'
    );
    expect(triggerSegmentationDataModifiedMock).toHaveBeenCalledWith(
      'segmentation-id'
    );
  });

  it('owns stale actor cleanup before remounting a stack labelmap', async () => {
    const staleActorEntry = {
      referencedId: 'old-derived-image-id',
      representationUID: 'segmentation-id-Labelmap-old-derived-image-id',
      uid: 'old-actor-uid',
    };
    const viewport = {
      id: 'viewport-id',
      type: 'planar',
      removeDisplaySet: jest.fn(),
    };
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: {
        Labelmap: {},
      },
    };

    getLabelmapActorEntriesMock
      .mockReturnValueOnce([staleActorEntry])
      .mockReturnValueOnce([]);

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: {} as never,
      },
    });

    await renderPlan.reconcile({
      actorEntries: [staleActorEntry] as never,
      labelMapData: {} as never,
    });

    expect(removeLabelmapRepresentationDataMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id',
      staleActorEntry
    );
    expect(syncStackLabelmapActorsMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id'
    );
  });

  it('mounts stack-backed labelmap layers as stable PlanarNext volume overlays', async () => {
    const stackLayer = {
      labelmapId: 'stack-layer-id',
      storageKind: 'stack',
      imageIds: ['labelmap-image-1', 'labelmap-image-2'],
    };
    const viewport = {
      id: 'viewport-id',
      type: 'planar',
      addDisplaySet: jest.fn(),
      getActors: jest.fn(() => [
        {
          representationUID: 'segmentation-id-Labelmap-stack-layer-id',
          uid: 'overlay-actor',
          actor: {},
        },
      ]),
      getCurrentImageIdIndex: jest.fn(() => 1),
      getCurrentMode: jest.fn(() => 'volume'),
      getViewReference: jest.fn(() => ({ volumeId: 'source-volume-id' })),
      getViewState: jest.fn(() => ({ orientation: 'axial' })),
      getVolumeId: jest.fn(() => 'source-volume-id'),
      render: jest.fn(),
      setDisplaySetAppearance: jest.fn(),
      setViewReference: jest.fn(),
    };
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: {
        Labelmap: {
          labelmaps: {
            'stack-layer-id': stackLayer,
          },
        },
      },
    };

    getViewportLabelmapRenderModeMock.mockReturnValue('volume');
    getLabelmapsMock.mockReturnValue([stackLayer]);
    getOrCreateLabelmapVolumeMock.mockReturnValue({
      volumeId: 'stack-layer-geometry-volume',
      imageIds: ['labelmap-image-1', 'labelmap-image-2'],
    });
    getVolumeMock.mockReturnValue({
      volumeId: 'stack-layer-geometry-volume',
      imageIds: ['labelmap-image-1', 'labelmap-image-2'],
    });

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: {} as never,
      },
    });

    expect(renderPlan.kind).toBe('legacy-volume');
    expect(renderPlan.getExpectedRepresentationUIDs()).toEqual([
      'segmentation-id-Labelmap-stack-layer-id',
    ]);

    await renderPlan.reconcile({
      actorEntries: [],
      labelMapData: segmentation.representationData.Labelmap as never,
    });

    expect(getOrCreateLabelmapVolumeMock).toHaveBeenCalledWith(stackLayer);
    expect(viewport.addDisplaySet).toHaveBeenCalledWith(
      'segmentation-id-Labelmap-stack-layer-id',
      {
        mode: 'volume',
        orientation: 'axial',
        role: 'overlay',
        initialImageIdIndex: 1,
        appearance: {
          blendMode: 1,
          visible: true,
        },
      }
    );
    expect(viewport.setDisplaySetAppearance).not.toHaveBeenCalled();
  });

  it('reduces a volume labelmap by foreground majority whichever loader built it', async () => {
    // A layer that already names its volume skips getOrCreateLabelmapVolume,
    // so the render plan is what tags the volume before its actor exists.
    const volumeLayer = {
      labelmapId: 'volume-layer-id',
      storageKind: 'volume',
      volumeId: 'segmentation-volume-id',
    };
    const segmentationVolume = {
      volumeId: 'segmentation-volume-id',
      imageIds: ['labelmap-image-1'],
      reductionStatistic: undefined,
    };
    const viewport = createPlanarVolumeViewport('volume-layer-id');
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: {
        Labelmap: {
          labelmaps: {
            'volume-layer-id': volumeLayer,
          },
        },
      },
    };

    getViewportLabelmapRenderModeMock.mockReturnValue('volume');
    getLabelmapsMock.mockReturnValue([volumeLayer]);
    getVolumeMock.mockReturnValue(segmentationVolume);

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: {} as never,
      },
    });

    expect(renderPlan.kind).toBe('legacy-volume');

    await renderPlan.reconcile({
      actorEntries: [],
      labelMapData: segmentation.representationData.Labelmap as never,
    });

    expect(getOrCreateLabelmapVolumeMock).not.toHaveBeenCalled();
    expect(segmentationVolume.reductionStatistic).toBe('foregroundMajority');
    expect(viewport.addDisplaySet).toHaveBeenCalledTimes(1);
    expect(triggerSegmentationDataModifiedMock).not.toHaveBeenCalled();
  });

  it('keeps the maximum intensity blend mode of a planar labelmap overlay when the GPU settings cannot hold the edge projection texture', async () => {
    const volumeLayer = {
      labelmapId: 'volume-layer-id',
      storageKind: 'volume',
      volumeId: 'segmentation-volume-id',
    };
    const volumeOf = (volumeId) => ({
      volumeId,
      imageIds: [`${volumeId}-image`],
      dimensions: [2048, 2048, 2048],
      voxelGrid: { dimensions: [2048, 2048, 2048] },
    });
    const viewport = createPlanarVolumeViewport('volume-layer-id');
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: {
        Labelmap: { labelmaps: { 'volume-layer-id': volumeLayer } },
      },
    };

    getViewportLabelmapRenderModeMock.mockReturnValue('volume');
    getLabelmapsMock.mockReturnValue([volumeLayer]);
    getVolumeMock.mockImplementation(volumeOf);
    (gpuSettingsForRender as jest.Mock).mockReturnValue({ id: 'low' });
    (utilities.voxelGrid.voxelGridWithinLimits as jest.Mock).mockReturnValue(
      false
    );

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: {
          blendMode: Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND,
        } as never,
      },
    });

    await renderPlan.reconcile({
      actorEntries: [],
      labelMapData: segmentation.representationData.Labelmap as never,
    });

    expect(viewport.addDisplaySet).toHaveBeenCalledWith(
      'segmentation-id-Labelmap-volume-layer-id',
      expect.objectContaining({
        appearance: {
          blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
          visible: true,
        },
      })
    );
    expect(utilities.logger.toolsLog.getLogger().warn).toHaveBeenCalledTimes(1);
  });

  it('draws the labelmap of a CPU slice source as slice images in place of a volume overlay', async () => {
    const volumeOverlayEntry = {
      referencedId: 'layer-id',
      representationUID: 'segmentation-id-Labelmap-layer-id',
      uid: 'volume-overlay-uid',
      displaySetId: 'segmentation-id-Labelmap-layer-id',
    };
    const viewport = {
      id: 'viewport-id',
      type: 'planar',
      removeDisplaySet: jest.fn(),
      getRenderPlan: jest.fn(() => [
        {
          displaySetId: 'segmentation-id-Labelmap-layer-id',
          role: 'overlay',
          slice: 'gpuVolume',
          draw: 'gpu',
        },
      ]),
    };
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: { Labelmap: {} },
    };
    const config = {};

    shouldUseSliceRenderingMock.mockImplementation(
      (_segmentation, _config, renderViewport) => renderViewport === viewport
    );
    canRenderVolumeViewportLabelmapAsImageMock.mockReturnValue(true);
    (
      getVolumeLabelmapImageMapperRepresentationUIDs as jest.Mock
    ).mockReturnValue(['segmentation-id-Labelmap-layer-id']);
    getLabelmapActorEntriesMock
      .mockReturnValueOnce([volumeOverlayEntry])
      .mockReturnValueOnce([]);

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: config as never,
      },
    });

    expect(shouldUseSliceRenderingMock).toHaveBeenCalledWith(
      segmentation,
      config,
      viewport
    );
    expect(renderPlan.kind).toBe('volume-slice-image-mapper');

    await renderPlan.reconcile({
      actorEntries: [volumeOverlayEntry] as never,
      labelMapData: {} as never,
    });

    expect(removeLabelmapRepresentationDataMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id',
      volumeOverlayEntry
    );
    expect(addVolumeLabelmapImageMapperActors).toHaveBeenCalledWith({
      viewport,
      segmentation,
      segmentationId: 'segmentation-id',
      outlineAtImageEdges: true,
    });
  });

  it('keeps the slice image outline when slice images were asked for on a sampled slice source', async () => {
    const viewport = {
      id: 'viewport-id',
      type: 'planar',
    };
    const segmentation = {
      segmentationId: 'segmentation-id',
      representationData: { Labelmap: {} },
    };
    const config = { useSliceRendering: true };

    shouldUseSliceRenderingMock.mockReturnValue(true);
    canRenderVolumeViewportLabelmapAsImageMock.mockReturnValue(true);
    (
      getVolumeLabelmapImageMapperRepresentationUIDs as jest.Mock
    ).mockReturnValue(['segmentation-id-Labelmap-layer-id']);
    getLabelmapActorEntriesMock.mockReturnValue([]);

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: segmentation as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: config as never,
      },
    });

    await renderPlan.reconcile({
      actorEntries: [] as never,
      labelMapData: {} as never,
    });

    expect(addVolumeLabelmapImageMapperActors).toHaveBeenCalledWith({
      viewport,
      segmentation,
      segmentationId: 'segmentation-id',
      outlineAtImageEdges: false,
    });
  });

  it('keeps the labelmap slice images of a CPU slice source', async () => {
    const sliceEntry = {
      referencedId: 'layer-id',
      representationUID: 'segmentation-id-Labelmap-layer-id',
      uid: 'slice-uid',
      displaySetId: 'slice-display-set',
    };
    const viewport = {
      id: 'viewport-id',
      type: 'planar',
      getRenderPlan: jest.fn(() => [
        {
          displaySetId: 'slice-display-set',
          role: 'overlay',
          slice: 'frame',
          draw: 'gpu',
        },
        {
          displaySetId: 'cpu-slice-display-set',
          role: 'overlay',
          slice: 'cpu',
          draw: 'gpu',
        },
      ]),
    };

    shouldUseSliceRenderingMock.mockReturnValue(true);
    canRenderVolumeViewportLabelmapAsImageMock.mockReturnValue(true);
    (
      getVolumeLabelmapImageMapperRepresentationUIDs as jest.Mock
    ).mockReturnValue(['segmentation-id-Labelmap-layer-id']);
    getLabelmapActorEntriesMock.mockReturnValue([sliceEntry]);

    const renderPlan = resolveLabelmapRenderPlan({
      viewport: viewport as never,
      segmentation: {
        segmentationId: 'segmentation-id',
        representationData: { Labelmap: {} },
      } as never,
      representation: {
        segmentationId: 'segmentation-id',
        config: {} as never,
      },
    });

    expect(renderPlan.needsRemount([sliceEntry] as never)).toBe(false);
    expect(
      renderPlan.needsRemount([
        { ...sliceEntry, displaySetId: 'cpu-slice-display-set' },
      ] as never)
    ).toBe(true);
  });
});
