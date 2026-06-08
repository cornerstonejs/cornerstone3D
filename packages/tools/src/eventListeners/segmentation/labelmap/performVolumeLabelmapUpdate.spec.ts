jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    Events: {
      IMAGE_VOLUME_MODIFIED: 'IMAGE_VOLUME_MODIFIED',
    },
  },
  cache: {
    getVolume: jest.fn(),
  },
  eventTarget: {},
  triggerEvent: jest.fn(),
}));

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({
    getOrCreateLabelmapVolume: jest.fn(),
  })
);

import { cache, eventTarget, triggerEvent } from '@cornerstonejs/core';
import { getOrCreateLabelmapVolume } from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { performVolumeLabelmapUpdate } from './performVolumeLabelmapUpdate';

const getVolumeMock = cache.getVolume as jest.Mock;
const getOrCreateLabelmapVolumeMock = getOrCreateLabelmapVolume as jest.Mock;
const triggerEventMock = triggerEvent as jest.Mock;

function createVolume(volumeId: string) {
  return {
    volumeId,
    imageIds: ['image-1', 'image-2', 'image-3'],
    imageData: {
      getDimensions: jest.fn(() => [16, 16, 3]),
      modified: jest.fn(),
    },
    metadata: {
      FrameOfReferenceUID: 'frame-of-reference',
    },
    vtkOpenGLTexture: {
      setUpdatedFrame: jest.fn(),
    },
    voxelManager: {
      invalidateCache: jest.fn(),
    },
  };
}

describe('performVolumeLabelmapUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates stack-backed labelmap geometry volumes', () => {
    const stackLayer = {
      labelmapId: 'stack-layer-id',
      type: 'stack',
      imageIds: ['labelmap-image-1', 'labelmap-image-2'],
    };
    const volume = createVolume('stack-layer-geometry-volume');

    getOrCreateLabelmapVolumeMock.mockReturnValue(volume);

    performVolumeLabelmapUpdate({
      modifiedSlicesToUse: [1],
      representationData: {
        Labelmap: {
          labelmaps: {
            'stack-layer-id': stackLayer,
          },
        },
      },
      type: 'Labelmap' as never,
    });

    expect(getOrCreateLabelmapVolumeMock).toHaveBeenCalledWith(stackLayer);
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).toHaveBeenCalledWith(1);
    expect(volume.voxelManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(volume.imageData.modified).toHaveBeenCalledTimes(1);
    expect(triggerEventMock).toHaveBeenCalledWith(
      eventTarget,
      'IMAGE_VOLUME_MODIFIED',
      {
        volumeId: 'stack-layer-geometry-volume',
        FrameOfReferenceUID: 'frame-of-reference',
        numberOfFrames: 3,
        framesProcessed: 3,
      }
    );
  });

  it('falls back to the legacy top-level labelmap volume id', () => {
    const volume = createVolume('legacy-volume-id');

    getVolumeMock.mockReturnValue(volume);

    performVolumeLabelmapUpdate({
      modifiedSlicesToUse: [],
      representationData: {
        Labelmap: {
          volumeId: 'legacy-volume-id',
        },
      },
      type: 'Labelmap' as never,
    });

    expect(getVolumeMock).toHaveBeenCalledWith('legacy-volume-id');
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).toHaveBeenCalledTimes(3);
    expect(triggerEventMock).toHaveBeenCalledWith(
      eventTarget,
      'IMAGE_VOLUME_MODIFIED',
      expect.objectContaining({
        volumeId: 'legacy-volume-id',
      })
    );
  });
});
