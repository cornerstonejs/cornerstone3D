import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

import cache from '../src/cache/cache';
import * as imageLoader from '../src/loaders/imageLoader';

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('cache eviction with images that are still loading', () => {
  let now;
  let defaultMaxCacheSize;
  const pending = {};
  const cancelled = [];

  beforeEach(() => {
    defaultMaxCacheSize = cache.getMaxCacheSize();
    cache.setMaxCacheSize(100);
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    imageLoader.registerImageLoader('deferred', (imageId) => {
      pending[imageId] = deferred();
      return {
        promise: pending[imageId].promise,
        cancelFn: () => cancelled.push(imageId),
      };
    });
  });

  afterEach(() => {
    cache.purgeCache();
    // Undo any leaked size so a failure does not cascade into later tests.
    cache.decrementImageCacheSize(cache.getCacheSize());
    imageLoader.unregisterAllImageLoaders();
    cache.setMaxCacheSize(defaultMaxCacheSize);
    jest.restoreAllMocks();
    cancelled.length = 0;
    Object.keys(pending).forEach((key) => delete pending[key]);
  });

  it('keeps an image that finishes loading after a newer request and needs eviction', async () => {
    // B is requested first, A second; A finishes loading first.
    const promiseB = imageLoader.loadAndCacheImage('deferred:B');
    now = 2000;
    const promiseA = imageLoader.loadAndCacheImage('deferred:A');

    pending['deferred:A'].resolve({ imageId: 'deferred:A', sizeInBytes: 60 });
    await promiseA;
    expect(cache.getCacheSize()).toBe(60);

    // B does not fit next to A, so A has to be evicted to make room for B.
    now = 3000;
    pending['deferred:B'].resolve({ imageId: 'deferred:B', sizeInBytes: 60 });
    await promiseB;

    expect(cache.getImage('deferred:B')).toBeDefined();
    expect(cache.getImage('deferred:A')).toBeUndefined();
    expect(cache.getCacheSize()).toBe(60);
    expect(cancelled).not.toContain('deferred:B');

    cache.purgeCache();
    expect(cache.getCacheSize()).toBe(0);
  });

  it('does not cancel an older in-flight load while making room for an image', async () => {
    imageLoader.loadAndCacheImage('deferred:inflight');

    now = 2000;
    const promiseLoaded = imageLoader.loadAndCacheImage('deferred:loaded');
    pending['deferred:loaded'].resolve({
      imageId: 'deferred:loaded',
      sizeInBytes: 60,
    });
    await promiseLoaded;

    now = 3000;
    const promiseNew = imageLoader.loadAndCacheImage('deferred:new');
    pending['deferred:new'].resolve({
      imageId: 'deferred:new',
      sizeInBytes: 60,
    });
    await promiseNew;

    expect(cache.getImage('deferred:new')).toBeDefined();
    expect(cache.getImage('deferred:loaded')).toBeUndefined();
    expect(cache.getCacheSize()).toBe(60);
    expect(cancelled).toEqual(['deferred:loaded']);
    expect(cache.getImageLoadObject('deferred:inflight')).toBeDefined();
  });

  it('still evicts a partial image that has no load in progress', async () => {
    cache.setPartialImage('deferred:partial', {
      imageId: 'deferred:partial',
      sizeInBytes: 50,
    });

    now = 2000;
    const promiseA = imageLoader.loadAndCacheImage('deferred:A');
    pending['deferred:A'].resolve({ imageId: 'deferred:A', sizeInBytes: 60 });
    await promiseA;

    now = 3000;
    const promiseB = imageLoader.loadAndCacheImage('deferred:B');
    pending['deferred:B'].resolve({ imageId: 'deferred:B', sizeInBytes: 60 });
    await promiseB;

    expect(cache.getImage('deferred:partial')).toBeUndefined();
    expect(cache.getImage('deferred:A')).toBeUndefined();
    expect(cache.getImage('deferred:B')).toBeDefined();
    expect(cache.getCacheSize()).toBe(60);
  });
});
