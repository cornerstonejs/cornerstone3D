import { describe, it, expect, afterEach } from '@jest/globals';
import { createAndCacheLocalImage } from '../src/loaders/imageLoader';
import { buildMetadata } from '../src/utilities/buildMetadata';
import cache from '../src/cache/cache';

describe('buildMetadata', () => {
  afterEach(() => {
    cache.purgeCache();
  });

  it('builds metadata for an image without a general series module', () => {
    const image = createAndCacheLocalImage('local://buildMetadata/1', {
      scalarData: new Int16Array(4),
      dimensions: [2, 2],
      spacing: [1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });

    const metadata = buildMetadata(image);

    expect(metadata.modality).toBeUndefined();
    expect(metadata.imagePixelModule.bitsAllocated).toBe(16);
  });
});
