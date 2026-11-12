import type { Segmentation } from '../../types/SegmentationStateTypes';

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    volumeLoader: {
      ...actual.volumeLoader,
      createAndCacheVolumeFromImages: jest.fn(),
    },
  };
});

import {
  defaultSegmentationStateManager,
  internalConvertStackToVolumeLabelmap,
} from './SegmentationStateManager';

const { volumeLoader: mockVolumeLoader } = jest.requireMock(
  '@cornerstonejs/core'
);
const createAndCacheVolumeFromImagesMock =
  mockVolumeLoader.createAndCacheVolumeFromImages as jest.Mock;

const segmentationId = 'stack-segmentation';
const convertedVolumeId = 'converted-volume';

function createStackSegmentation(
  imageIds = ['labelmap-image-1', 'labelmap-image-2']
): Segmentation {
  return {
    segmentationId,
    label: 'Segmentation',
    cachedStats: {},
    segments: {
      1: {
        segmentIndex: 1,
        label: 'Segment 1',
        locked: false,
        cachedStats: {},
        active: true,
      },
    },
    representationData: {
      Labelmap: {
        imageIds,
        referencedImageIds: ['source-image-1', 'source-image-2'],
      },
    },
  };
}

function getLabelmapData() {
  return defaultSegmentationStateManager.getSegmentation(segmentationId)
    .representationData.Labelmap;
}

function getPrimaryLayer() {
  const labelmapData = getLabelmapData();
  return labelmapData.labelmaps[labelmapData.primaryLabelmapId];
}

async function convert() {
  await internalConvertStackToVolumeLabelmap({
    segmentationId,
    options: { viewportId: 'viewport', volumeId: convertedVolumeId },
  });
}

describe('internalConvertStackToVolumeLabelmap', () => {
  beforeEach(() => {
    createAndCacheVolumeFromImagesMock.mockReset();
    createAndCacheVolumeFromImagesMock.mockResolvedValue(undefined);
    defaultSegmentationStateManager.addSegmentation(createStackSegmentation());
  });

  afterEach(() => {
    defaultSegmentationStateManager.resetState();
  });

  it('builds the volume from the labelmap stack image ids', async () => {
    await convert();

    expect(createAndCacheVolumeFromImagesMock).toHaveBeenCalledWith(
      convertedVolumeId,
      ['labelmap-image-1', 'labelmap-image-2']
    );
  });

  it('writes the volumeId to the primary layer and the legacy mirror', async () => {
    await convert();

    expect(getPrimaryLayer().volumeId).toBe(convertedVolumeId);
    expect(getLabelmapData().volumeId).toBe(convertedVolumeId);
  });

  it('marks the converted primary layer as volume storage', async () => {
    expect(getPrimaryLayer().storageKind).toBe('stack');

    await convert();

    expect(getPrimaryLayer().storageKind).toBe('volume');
  });

  it('keeps the volumeId after a later segmentation update', async () => {
    await convert();

    defaultSegmentationStateManager.updateSegmentation(segmentationId, {
      label: 'Renamed',
    });

    expect(getPrimaryLayer().volumeId).toBe(convertedVolumeId);
    expect(getLabelmapData().volumeId).toBe(convertedVolumeId);
    expect(getLabelmapData().imageIds).toEqual([
      'labelmap-image-1',
      'labelmap-image-2',
    ]);
  });

  it('writes to the live segmentation when state changes during conversion', async () => {
    createAndCacheVolumeFromImagesMock.mockImplementation(async () => {
      defaultSegmentationStateManager.updateSegmentation(segmentationId, {
        label: 'Updated during conversion',
      });
    });

    await convert();

    expect(getLabelmapData().volumeId).toBe(convertedVolumeId);
    expect(getPrimaryLayer().volumeId).toBe(convertedVolumeId);
  });

  it('leaves overlapping labelmaps on the merged-volume path', async () => {
    defaultSegmentationStateManager.resetState();
    defaultSegmentationStateManager.addSegmentation(
      createStackSegmentation([
        'labelmap-image-1',
        'labelmap-image-2',
        'labelmap-image-3',
        'labelmap-image-4',
      ])
    );

    await convert();

    expect(createAndCacheVolumeFromImagesMock).not.toHaveBeenCalled();
    expect(getPrimaryLayer().volumeId).toBeUndefined();
    expect('volumeId' in getLabelmapData()).toBe(false);
  });

  it('does nothing when the segmentation is removed during conversion', async () => {
    createAndCacheVolumeFromImagesMock.mockImplementation(async () => {
      defaultSegmentationStateManager.resetState();
    });

    await expect(convert()).resolves.toBeUndefined();
    expect(
      defaultSegmentationStateManager.getSegmentation(segmentationId)
    ).toBeUndefined();
  });
});
