jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getVolume: jest.fn(),
    getVolumeContainingImageId: jest.fn(),
  },
  volumeLoader: {
    createAndCacheVolumeFromImagesSync: jest.fn((volumeId, imageIds) => ({
      volumeId,
      imageIds,
    })),
  },
}));

jest.mock('./labelmapImageIdMapping', () => ({
  forEachLabelmapImageReference: (layer, callback) =>
    layer.imageIds.forEach((imageId, index) =>
      callback(layer.referencedImageIds[index], imageId, index)
    ),
}));

import {
  getOrCreateDimensionGroupLabelmapVolume,
  isDimensionGroupLabelmap,
} from './dimensionGroupLabelmapVolume';

const { cache, volumeLoader } = jest.requireMock('@cornerstonejs/core');

// Two time points of two positions; the labelmap has one image for each frame.
const TIME_POINTS = [
  ['pt:t1-z1', 'pt:t1-z2'],
  ['pt:t2-z1', 'pt:t2-z2'],
];
const dynamicVolume = {
  volumeId: 'dynamic-pt',
  isDynamicVolume: () => true,
  dimensionGroupNumber: 2,
  getCurrentDimensionGroupImageIds: () =>
    TIME_POINTS[dynamicVolume.dimensionGroupNumber - 1],
};

const layerFor = (referencedImageIds: string[]) =>
  ({
    labelmapId: 'seg-storage-0',
    storageKind: 'stack',
    referencedImageIds,
    imageIds: referencedImageIds.map((imageId) => `labelmap:${imageId}`),
  }) as never;

describe('dimension group labelmap volume', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.getVolumeContainingImageId.mockReturnValue({ volume: dynamicVolume });
    cache.getVolume.mockImplementation((volumeId) =>
      volumeId === dynamicVolume.volumeId ? dynamicVolume : undefined
    );
  });

  it('gives the labelmap images of the time point that the volume shows', () => {
    const volume = getOrCreateDimensionGroupLabelmapVolume(
      layerFor(TIME_POINTS.flat())
    );

    expect(
      volumeLoader.createAndCacheVolumeFromImagesSync
    ).toHaveBeenCalledWith('seg-storage-0-dimensionGroup-2', [
      'labelmap:pt:t2-z1',
      'labelmap:pt:t2-z2',
    ]);
    expect(volume.volumeId).toBe('seg-storage-0-dimensionGroup-2');
  });

  it('applies only to a labelmap of more than one time point of a dynamic volume', () => {
    expect(isDimensionGroupLabelmap(layerFor(TIME_POINTS.flat()))).toBe(true);
    expect(isDimensionGroupLabelmap(layerFor(TIME_POINTS[1]))).toBe(false);

    cache.getVolumeContainingImageId.mockReturnValue({
      volume: { volumeId: 'ct', isDynamicVolume: () => false },
    });
    expect(isDimensionGroupLabelmap(layerFor(['ct:z1', 'ct:z2']))).toBe(false);
  });
});
