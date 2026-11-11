import { describe, it, expect, jest, afterEach } from '@jest/globals';
import {
  cache,
  imageLoadPoolManager,
  StreamingImageVolume,
  utilities,
} from '@cornerstonejs/core';

const mockImageIds = Array.from({ length: 4 }, (_, k) => `image:prefetch:${k}`);

jest.mock('../../../src/utilities/stackPrefetch/stackPrefetchUtils', () => ({
  ...jest.requireActual(
    '../../../src/utilities/stackPrefetch/stackPrefetchUtils'
  ),
  getStackData: () => ({ currentImageIdIndex: 0, imageIds: mockImageIds }),
}));
// The state of the prefetch, kept for an element with no rendering engine.
jest.mock('../../../src/utilities/stackPrefetch/state', () => {
  const mockState = new Map();
  return {
    addToolState: (element, data) => mockState.set(element, data),
    getToolState: (element) => mockState.get(element),
  };
});

import stackPrefetch from '../../../src/utilities/stackPrefetch/stackPrefetch';

function makeVolume() {
  const dimensions = [2, 2, mockImageIds.length];

  return new StreamingImageVolume(
    {
      volumeId: 'prefetch-volume',
      metadata: { FrameOfReferenceUID: 'for-1' },
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageIds: mockImageIds,
      dataType: 'Uint16Array',
      numberOfComponents: 1,
      voxelManager: utilities.VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: new Uint16Array(4 * mockImageIds.length),
        numberOfComponents: 1,
      }),
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
}

describe('stackPrefetch with a progressive volume of the same images', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    cache.purgeCache();
  });

  // The user experience must have this: a stack keeps its prefetch when a
  // progressive volume of its images stops before the end.
  it('queues the stack prefetch again when the volume load is cancelled', () => {
    const addRequest = jest
      .spyOn(imageLoadPoolManager, 'addRequest')
      .mockImplementation(() => undefined);
    const volume = makeVolume();
    volume.autoRenderOnLoad = false;
    cache.putVolumeSync(volume.volumeId, volume);
    const element = document.createElement('div');
    const queued = () =>
      [...new Set(addRequest.mock.calls.map(([, , d]) => d.imageId))].sort();

    stackPrefetch.enable(element);
    expect(queued()).toEqual(mockImageIds.slice(1));

    // A progressive load starts and takes the prefetch out of the pool.
    volume.loadStatus.loading = true;
    volume.imagesLoader = { loadImages: () => Promise.resolve() };
    volume.removeOtherPrefetchRequests();
    addRequest.mockClear();

    volume.cancelLoading();

    expect(queued()).toEqual(mockImageIds.slice(1));
    stackPrefetch.disable(element);
  });
});
