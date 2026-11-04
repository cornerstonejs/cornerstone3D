import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import cache from '../src/cache/cache';
import StreamingImageVolume from '../src/cache/classes/StreamingImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';
import eventTarget from '../src/eventTarget';
import triggerEvent from '../src/utilities/triggerEvent';
import Events from '../src/enums/Events';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';

// Only a caller that knows the quality of a delivery records it. A mark that
// refills a texture records nothing, because a record states a quality, and a
// lower record never replaces a higher one.

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
});

const dimensions = [4, 4, 4];

function makeVolume() {
  const volumeId = 'streaming-deliveries';
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `image:${volumeId}:${k}`
  );
  const volume = new StreamingImageVolume(
    {
      volumeId,
      metadata: { FrameOfReferenceUID: 'for-1' },
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageIds,
      dataType: 'Uint16Array',
      numberOfComponents: 1,
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: new Uint16Array(4 * 4 * 4),
        numberOfComponents: 1,
      }),
    },
    {
      loadStatus: {
        loaded: false,
        loading: true,
        cancelled: false,
        callbacks: [],
      },
    }
  );

  // No rendering engine exists in these tests.
  volume.autoRenderOnLoad = false;

  return { volume, imageIds };
}

function recordOf(volume) {
  const composite = volume.compositeVoxelManager;

  return composite.getRegionQuality(
    composite.getRepresentation(volume.voxelGrid)
  );
}

describe('StreamingImageVolume — the record of the deliveries', () => {
  it('records no quality when an image reaches the cache before its delivery', () => {
    const { volume, imageIds } = makeVolume();

    volume.listenForCachedImages();

    // The cache adds the image before the loader calls `successCallback`.
    triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_ADDED, {
      image: { imageId: imageIds[1] },
    });

    expect(recordOf(volume).deliveries).toBe(0);

    volume.updateTextureAndTriggerEvents(
      1,
      imageIds[1],
      ImageQualityStatus.SUBRESOLUTION
    );

    const record = recordOf(volume);

    expect(record.deliveries).toBe(1);
    expect(record.highest).toBe(ImageQualityStatus.SUBRESOLUTION);

    volume.stopListeningForCachedImages();
  });

  it('records no quality when the volume is invalidated', () => {
    const { volume, imageIds } = makeVolume();

    volume.updateTextureAndTriggerEvents(
      0,
      imageIds[0],
      ImageQualityStatus.SUBRESOLUTION
    );

    volume.invalidateVolume(false);

    const record = recordOf(volume);

    // One delivery, at its own quality. The frames that never arrived stay
    // missing.
    expect(record.deliveries).toBe(1);
    expect(record.highest).toBe(ImageQualityStatus.SUBRESOLUTION);
    expect(record.missing).toBe(4 * 4 * 3);
  });
});

describe('StreamingImageVolume — the images that the cache already holds', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  /** The cache holds full images for the indices in `cached`. */
  function mockCache(imageIds, cached) {
    const held = new Set(cached.map((index) => imageIds[index]));

    jest.spyOn(cache, 'isLoaded').mockImplementation((id) => held.has(id));
    jest
      .spyOn(cache, 'getImage')
      .mockImplementation((id) => (held.has(id) ? { imageId: id } : undefined));
  }

  it('delivers the cached images in batches, so a large take-in does not stall', () => {
    jest.useFakeTimers();
    const { volume, imageIds } = makeVolume();
    let now = 0;

    mockCache(imageIds, [0, 2, 3]);
    // Each read of the clock passes the batch time, so a batch takes one image.
    jest.spyOn(performance, 'now').mockImplementation(() => (now += 10));

    volume.takeInCachedImages();

    expect(volume.getImageQuality(0)).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(volume.getImageQuality(2)).toBeUndefined();

    jest.runAllTimers();

    expect(volume.getImageQuality(1)).toBeUndefined();
    expect(volume.getImageQuality(2)).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(volume.getImageQuality(3)).toBe(ImageQualityStatus.FULL_RESOLUTION);
  });

  it('stops the take-in when the load is cancelled', () => {
    jest.useFakeTimers();
    const { volume, imageIds } = makeVolume();
    let now = 0;

    mockCache(imageIds, [0, 1, 2, 3]);
    jest.spyOn(performance, 'now').mockImplementation(() => (now += 10));

    volume.takeInCachedImages();
    volume.loadStatus.cancelled = true;
    jest.runAllTimers();

    expect(volume.getImageQuality(0)).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(volume.getImageQuality(1)).toBeUndefined();
  });
});
