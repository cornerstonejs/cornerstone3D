jest.mock('@cornerstonejs/core', () => ({
  ActorRenderMode: {
    CPU_VOLUME: 'CPU_VOLUME',
    VTK_VOLUME_SLICE: 'VTK_VOLUME_SLICE',
  },
  Enums: {
    BlendModes: {
      LABELMAP_EDGE_PROJECTION_BLEND: 0,
      MAXIMUM_INTENSITY_BLEND: 1,
    },
    ViewportType: {
      ORTHOGRAPHIC: 'orthographic',
      PLANAR_NEXT: 'planarNext',
    },
  },
  addVolumesToViewports: jest.fn(),
  cache: {
    getVolume: jest.fn(),
  },
  utilities: {
    uuidv4: jest.fn(() => 'generated-volume-id'),
    viewportNextDataSetMetadataProvider: {
      add: jest.fn(),
      remove: jest.fn(),
    },
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
  })
);

jest.mock(
  '../../../stateManagement/segmentation/triggerSegmentationEvents',
  () => ({
    triggerSegmentationDataModified: jest.fn(),
    triggerSegmentationModified: jest.fn(),
  })
);

jest.mock('./addVolumesAsIndependentComponents', () => ({
  addVolumesAsIndependentComponents: jest.fn(),
}));

jest.mock('./removeLabelmapRepresentationData', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./syncStackLabelmapActors', () => ({
  syncStackLabelmapActors: jest.fn(),
}));

jest.mock('./volumeLabelmapImageMapper', () => ({
  addVolumeLabelmapImageMapperActors: jest.fn(),
  getVolumeLabelmapImageMapperRepresentationUIDs: jest.fn(() => []),
  removeVolumeLabelmapImageMapperActors: jest.fn(),
  updateVolumeLabelmapImageMapperActors: jest.fn(),
}));

import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  canRenderVolumeViewportLabelmapAsImage,
  shouldUseSliceRendering,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import removeLabelmapRepresentationData from './removeLabelmapRepresentationData';
import { syncStackLabelmapActors } from './syncStackLabelmapActors';
import { removeVolumeLabelmapImageMapperActors } from './volumeLabelmapImageMapper';
import { resolveLabelmapRenderPlan } from './labelmapRenderPlan';

const getCurrentLabelmapImageIdsForViewportMock =
  getCurrentLabelmapImageIdsForViewport as jest.Mock;
const getLabelmapActorEntriesMock = getLabelmapActorEntries as jest.Mock;
const getViewportLabelmapRenderModeMock =
  getViewportLabelmapRenderMode as jest.Mock;
const canRenderVolumeViewportLabelmapAsImageMock =
  canRenderVolumeViewportLabelmapAsImage as unknown as jest.Mock;
const shouldUseSliceRenderingMock = shouldUseSliceRendering as jest.Mock;
const removeLabelmapRepresentationDataMock =
  removeLabelmapRepresentationData as jest.Mock;
const removeVolumeLabelmapImageMapperActorsMock =
  removeVolumeLabelmapImageMapperActors as jest.Mock;
const syncStackLabelmapActorsMock = syncStackLabelmapActors as jest.Mock;
const triggerSegmentationDataModifiedMock =
  triggerSegmentationDataModified as jest.Mock;

describe('labelmapRenderPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canRenderVolumeViewportLabelmapAsImageMock.mockReturnValue(false);
    getCurrentLabelmapImageIdsForViewportMock.mockReturnValue([
      'derived-image-id',
    ]);
    getLabelmapActorEntriesMock.mockReturnValue([]);
    getViewportLabelmapRenderModeMock.mockReturnValue('image');
    removeLabelmapRepresentationDataMock.mockReturnValue(false);
    shouldUseSliceRenderingMock.mockReturnValue(false);
  });

  it('owns stack labelmap mount and expected actor UID behavior', async () => {
    const viewport = {
      id: 'viewport-id',
      removeActors: jest.fn(),
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
      'segmentation-id-Labelmap-derived-image-id',
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
      removeActors: jest.fn(),
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

    expect(removeVolumeLabelmapImageMapperActorsMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id'
    );
    expect(removeLabelmapRepresentationDataMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id',
      staleActorEntry
    );
    expect(viewport.removeActors).toHaveBeenCalledWith(['old-actor-uid']);
    expect(syncStackLabelmapActorsMock).toHaveBeenCalledWith(
      viewport,
      'segmentation-id'
    );
  });
});
