import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { ImageQualityStatus } from '../src/enums';
import cache from '../src/cache/cache';
import { createAndCacheLocalImage } from '../src/loaders/imageLoader';
import { fillNearbyFrames } from '../src/loaders/fillNearbyFrames';

/**
 * Row 296 of `v6-open-issues.md`: `cache.setPartialImage` replaced the image
 * of a cache entry whatever the qualities, and only `fillNearbyFrames`
 * checked before it called. The cache now keeps the rule itself: it never
 * replaces an image by one of a worse quality (a copy of another slice is
 * worse than any data of the frame itself), own data of an equal quality
 * replaces (a decode again), a copy replaces only a worse image (as
 * `fillNearbyFrames` did), and it answers whether it replaced.
 */

const { FAR_REPLICATE, ADJACENT_REPLICATE, SUBRESOLUTION, LOSSY } =
  ImageQualityStatus;

/** A partial image of a frame, of a quality. */
function partial(imageId, imageQualityStatus, name = '') {
  return { imageId, imageQualityStatus, name };
}

describe('cache.setPartialImage', () => {
  const imageIds = [];

  function id(name) {
    const imageId = `partial-quality:${name}`;

    imageIds.push(imageId);

    return imageId;
  }

  afterEach(() => {
    imageIds
      .splice(0)
      .filter((imageId) => cache.getImage(imageId))
      .forEach((imageId) => {
        cache.removeImageLoadObject(imageId, { force: true });
      });
  });

  it('keeps a full-quality image through a later partial and a later replicate, and the entry stays loaded', () => {
    const imageId = id('full');
    const full = createAndCacheLocalImage(imageId, {
      dimensions: [2, 2],
      spacing: [1, 1],
    });
    const generation = cache.getImageGeneration();

    expect(cache.isLoaded(imageId)).toBe(true);
    expect(cache.setPartialImage(imageId, partial(imageId, LOSSY))).toBe(false);
    expect(
      cache.setPartialImage(imageId, partial(imageId, ADJACENT_REPLICATE))
    ).toBe(false);
    expect(cache.getImage(imageId)).toBe(full);
    expect(cache.getImageQuality(imageId)).toBe(
      ImageQualityStatus.FULL_RESOLUTION
    );
    expect(cache.isLoaded(imageId)).toBe(true);
    expect(cache.getImageGeneration()).toBe(generation);
  });

  it('keeps own data of a quality through a worse partial and any replicate', () => {
    const imageId = id('lossy');
    const lossy = partial(imageId, LOSSY);

    expect(cache.setPartialImage(imageId, lossy)).toBe(true);
    expect(
      cache.setPartialImage(imageId, partial(imageId, SUBRESOLUTION))
    ).toBe(false);
    expect(
      cache.setPartialImage(imageId, partial(imageId, FAR_REPLICATE))
    ).toBe(false);
    expect(cache.getImage(imageId)).toBe(lossy);
  });

  it('replaces a replicate by own data of any quality', () => {
    [SUBRESOLUTION, LOSSY, ImageQualityStatus.FULL_RESOLUTION].forEach(
      (quality) => {
        [FAR_REPLICATE, ADJACENT_REPLICATE].forEach((replicateQuality) => {
          const imageId = id(`replicate-${replicateQuality}-${quality}`);
          const own = partial(imageId, quality);

          cache.setPartialImage(imageId, partial(imageId, replicateQuality));

          expect(cache.setPartialImage(imageId, own)).toBe(true);
          expect(cache.getImage(imageId)).toBe(own);
        });
      }
    );
  });

  it('replaces own data by own data of an equal quality, as a decode again does', () => {
    const imageId = id('equal');
    const again = partial(imageId, LOSSY, 'again');

    cache.setPartialImage(imageId, partial(imageId, LOSSY, 'first'));

    expect(cache.setPartialImage(imageId, again)).toBe(true);
    expect(cache.getImage(imageId)).toBe(again);
  });

  it('replaces a replicate only by a better one, never by another copy of its quality', () => {
    const imageId = id('copies');
    const first = partial(imageId, FAR_REPLICATE, 'first');
    const adjacent = partial(imageId, ADJACENT_REPLICATE, 'adjacent');

    expect(cache.setPartialImage(imageId, first)).toBe(true);
    expect(
      cache.setPartialImage(imageId, partial(imageId, FAR_REPLICATE, 'second'))
    ).toBe(false);
    expect(cache.getImage(imageId)).toBe(first);
    expect(cache.setPartialImage(imageId, adjacent)).toBe(true);
    expect(cache.getImage(imageId)).toBe(adjacent);
  });

  it('keeps the image when it is given none, and answers that it replaced nothing', () => {
    const imageId = id('none');
    const lossy = partial(imageId, LOSSY);

    cache.setPartialImage(imageId, lossy);

    expect(cache.setPartialImage(imageId, undefined, true)).toBe(false);
    expect(cache.getImage(imageId)).toBe(lossy);
  });

  it('lets fillNearbyFrames deliver a copy only where the cache took it', () => {
    const source = id('fill-source');
    const better = id('fill-better');
    const equal = id('fill-equal');
    const worse = id('fill-worse');
    const empty = id('fill-empty');
    const listener = { successCallback: jest.fn(), errorCallback: jest.fn() };

    cache.setPartialImage(better, partial(better, LOSSY));
    cache.setPartialImage(equal, partial(equal, ADJACENT_REPLICATE));
    cache.setPartialImage(worse, partial(worse, FAR_REPLICATE));
    fillNearbyFrames(
      listener,
      {
        nearbyRequests: [better, equal, worse, empty].map((itemId) => ({
          itemId,
          imageQualityStatus: ADJACENT_REPLICATE,
        })),
      },
      {
        imageId: source,
        imageQualityStatus: ImageQualityStatus.FULL_RESOLUTION,
      }
    );

    expect(
      listener.successCallback.mock.calls.map(([itemId]) => itemId)
    ).toEqual([worse, empty]);
    expect(cache.getImageQuality(better)).toBe(LOSSY);
    expect(cache.getImageQuality(worse)).toBe(ADJACENT_REPLICATE);
    expect(cache.getImageQuality(empty)).toBe(ADJACENT_REPLICATE);
  });
});
