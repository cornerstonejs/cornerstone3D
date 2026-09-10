import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createAndCacheLocalImage } from '../src/loaders/imageLoader';
import cache from '../src/cache/cache';
import * as metaData from '../src/metaData';
import MetadataModules from '../src/enums/MetadataModules';
import { buildMetadata } from '../src/utilities/buildMetadata';
import genericMetadataProvider from '../src/utilities/genericMetadataProvider';

function createLocalSlice(imageId, extra = {}) {
  return createAndCacheLocalImage(imageId, {
    scalarData: new Int16Array(4).fill(-1000),
    dimensions: [2, 2],
    spacing: [1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    ...extra,
  });
}

describe('createAndCacheLocalImage metadata', () => {
  beforeEach(() => {
    cache.purgeCache();
    genericMetadataProvider.clear();
    metaData.removeAllProviders();
    metaData.addProvider(genericMetadataProvider.get);
  });

  afterEach(() => {
    cache.purgeCache();
    genericMetadataProvider.clear();
  });

  it('registers generalSeriesModule so buildMetadata can read modality', () => {
    const imageId = 'local:slice0';
    const image = createLocalSlice(imageId);

    expect(metaData.get(MetadataModules.GENERAL_SERIES, imageId)).toEqual(
      expect.any(Object)
    );
    expect(() => buildMetadata(image)).not.toThrow();
  });

  it('stores an explicit modality on generalSeriesModule', () => {
    const imageId = 'local:ct';
    const image = createLocalSlice(imageId, { modality: 'CT' });

    expect(metaData.get(MetadataModules.GENERAL_SERIES, imageId)).toEqual(
      expect.objectContaining({ modality: 'CT' })
    );
    expect(buildMetadata(image).modality).toBe('CT');
  });

  it('copies generalSeriesModule from a referenced image', () => {
    const referencedImageId = 'local:ref';
    genericMetadataProvider.add(referencedImageId, {
      type: MetadataModules.GENERAL_SERIES,
      metadata: { modality: 'PT', seriesInstanceUID: '1.2.3' },
    });

    const imageId = 'local:from-ref';
    const image = createLocalSlice(imageId, { referencedImageId });

    expect(metaData.get(MetadataModules.GENERAL_SERIES, imageId)).toEqual(
      expect.objectContaining({
        modality: 'PT',
        seriesInstanceUID: '1.2.3',
      })
    );
    expect(buildMetadata(image).modality).toBe('PT');
  });
});
