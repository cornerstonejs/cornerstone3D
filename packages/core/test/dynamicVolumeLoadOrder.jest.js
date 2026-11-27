import { afterEach, expect, it, jest } from '@jest/globals';
import StreamingDynamicImageVolume from '../src/cache/classes/StreamingDynamicImageVolume';
import imageLoadPoolManager from '../src/requestPool/imageLoadPoolManager';

afterEach(() => jest.restoreAllMocks());

it.each([
  [1, [0, 1, 2]],
  [2, [1, 0, 2]],
  [3, [2, 1, 0]],
])('queues active dimension group %i first', async (activeGroup, order) => {
  const imageIdGroups = [
    ['phase1:slice1', 'phase1:slice2'],
    ['phase2:slice1', 'phase2:slice2'],
    ['phase3:slice1', 'phase3:slice2'],
  ];
  const imageIds = imageIdGroups.flat();
  const volume = new StreamingDynamicImageVolume(
    {
      volumeId: 'dynamic-load-order',
      imageIds,
      imageIdGroups,
      splittingTag: 'TemporalPositionIdentifier',
      dimensions: [1, 1, 2],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      dataType: 'Uint16Array',
      voxelManager: { setDimensionGroupNumber: jest.fn() },
    },
    {
      loadStatus: {
        loaded: false,
        loading: false,
        cancelled: false,
        callbacks: [],
      },
    }
  );

  jest.spyOn(volume, 'invalidateVolume').mockImplementation(() => {});
  jest.spyOn(volume, 'getLoaderImageOptions').mockReturnValue({});
  const loadImage = jest.spyOn(volume, 'callLoadImage').mockResolvedValue();
  // Execute requests in insertion order without starting network or pool timers.
  jest
    .spyOn(imageLoadPoolManager, 'addRequest')
    .mockImplementation((request) => {
      request();
    });

  volume.dimensionGroupNumber = activeGroup;
  await volume.loadImages();

  expect(loadImage.mock.calls.map(([imageId]) => imageId)).toEqual(
    order.flatMap((index) => imageIdGroups[index])
  );
  expect(volume.imageIds).toEqual(imageIdGroups.flat());
});
