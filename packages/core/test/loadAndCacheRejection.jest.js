import { describe, it, expect, afterEach } from '@jest/globals';

import cache from '../src/cache/cache';
import * as imageLoader from '../src/loaders/imageLoader';
import * as volumeLoader from '../src/loaders/volumeLoader';

// Jest fails the running test on an unhandled promise rejection. Each test
// waits for pending rejections to be reported before it ends.
function flushRejections() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('loadAndCacheImage', () => {
  afterEach(() => {
    imageLoader.unregisterAllImageLoaders();
    cache.purgeCache();
  });

  it('leaves no unhandled rejection when the image fails to load', async () => {
    imageLoader.registerImageLoader('failing', () => ({
      promise: Promise.reject(new Error('network error')),
    }));

    await expect(imageLoader.loadAndCacheImage('failing:1')).rejects.toThrow(
      'network error'
    );
    await flushRejections();

    expect(cache.getImageLoadObject('failing:1')).toBeUndefined();
  });

  it('leaves no unhandled rejection when the image does not fit in the cache', async () => {
    const image = {
      imageId: 'large:1',
      sizeInBytes: cache.getMaxCacheSize() + 1,
    };
    imageLoader.registerImageLoader('large', () => ({
      promise: Promise.resolve(image),
    }));

    await expect(imageLoader.loadAndCacheImage('large:1')).resolves.toBe(image);
    await flushRejections();

    expect(cache.getImageLoadObject('large:1')).toBeUndefined();
  });
});

describe('createAndCacheVolume', () => {
  afterEach(() => {
    cache.purgeCache();
  });

  it('leaves no unhandled rejection when the volume fails to load', async () => {
    volumeLoader.registerVolumeLoader('failing', () => ({
      promise: Promise.reject(new Error('network error')),
    }));

    await expect(
      volumeLoader.createAndCacheVolume('failing:1')
    ).rejects.toThrow('network error');
    await flushRejections();

    expect(cache.getVolumeLoadObject('failing:1')).toBeUndefined();
  });
});
