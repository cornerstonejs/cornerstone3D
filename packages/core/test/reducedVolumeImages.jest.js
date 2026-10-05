import { describe, it, expect, beforeEach } from '@jest/globals';
import cache from '../src/cache/cache';
import ImageVolume from '../src/cache/classes/ImageVolume';
import {
  isReducedImageId,
  parseReducedImageId,
  provideReducedImages,
  reducedImageId,
} from '../src/cache/reducedVolumeImages';
import { createAndCacheLocalImage } from '../src/loaders/imageLoader';
import imageIdToURI from '../src/utilities/imageIdToURI';
import * as metaData from '../src/metaData';
import MetadataModules from '../src/enums/MetadataModules';
import { VoxelStatistics } from '../src/enums';

// THE IMAGE CACHE IS THE ONE STORE OF THE VOXELS. A reduced representation
// holds one image of that cache for each slice of its grid, exactly as a volume
// holds one image for each of its frames, so the cache counts the reduced
// voxels, evicts them and shares them between the volumes that derive them.

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const dimensions = [4, 4, 4];
const spacing = [1, 1, 2];
const origin = [10, 20, 30];
const source = 'wadors:https://example.org/studies/1/series/2/frames/1';

/** The image ids of one volume, with an image in the cache for each of them. */
function cacheFrames(volumeId, values) {
  return values.map((fill, k) => {
    const imageId = `test:${volumeId}:${k}`;
    const scalarData = new Uint16Array(dimensions[0] * dimensions[1]);

    scalarData.fill(fill);

    createAndCacheLocalImage(imageId, {
      scalarData,
      dimensions: [dimensions[0], dimensions[1]],
      spacing: [spacing[0], spacing[1]],
      origin: [origin[0], origin[1], origin[2] + k * spacing[2]],
      direction: identityDirection,
      targetBuffer: { type: 'Uint16Array' },
    });

    return imageId;
  });
}

function makeVolume(volumeId, imageIds) {
  return new ImageVolume({
    volumeId,
    metadata: { FrameOfReferenceUID: 'for-1' },
    dimensions,
    spacing,
    origin,
    direction: identityDirection,
    imageIds,
    dataType: 'Uint16Array',
    numberOfComponents: 1,
  });
}

beforeEach(() => {
  cache.purgeCache();
});

describe('the image id of a reduced slice', () => {
  it('names the source, the size of the reduced slice and the statistic', () => {
    expect(
      reducedImageId({
        sourceImageId: source,
        columns: 256,
        rows: 256,
        statistic: VoxelStatistics.Average,
      })
    ).toBe(`reduced:256x256:average:${source}`);
  });

  it('states the number of source frames when the k axis reduces', () => {
    expect(
      reducedImageId({
        sourceImageId: source,
        columns: 256,
        rows: 128,
        frames: 2,
        statistic: VoxelStatistics.Average,
      })
    ).toBe(`reduced:256x128x2:average:${source}`);
  });

  it('gives back the parts that it holds', () => {
    const imageId = reducedImageId({
      sourceImageId: source,
      columns: 64,
      rows: 32,
      frames: 4,
      statistic: 'minimum',
    });

    expect(isReducedImageId(imageId)).toBe(true);
    expect(parseReducedImageId(imageId)).toEqual({
      sourceImageId: source,
      columns: 64,
      rows: 32,
      frames: 4,
      statistic: 'minimum',
    });
  });

  it('holds no parts for an id that names no reduced slice', () => {
    expect(isReducedImageId(source)).toBe(false);
    expect(parseReducedImageId(source)).toBeUndefined();
  });

  // THE SIZE MUST COME BEFORE THE STATISTIC. `imageIdToURI` strips one scheme
  // prefix when a second scheme-like prefix follows it, so a statistic in that
  // place would give the URI of the SOURCE image, and the two would collide in
  // `cache.getCachedImageBasedOnImageURI`.
  it('keeps a URI of its own, and does not take the URI of its source', () => {
    const imageId = reducedImageId({
      sourceImageId: source,
      columns: 256,
      rows: 256,
    });

    expect(imageIdToURI(imageId)).not.toBe(imageIdToURI(source));
    expect(imageIdToURI(imageId)).toBe(imageId);
  });
});

describe('the images of a reduced representation', () => {
  const grid = {
    origin: [10.5, 20.5, 31],
    direction: identityDirection,
    spacing: [2, 2, 4],
    dimensions: [2, 2, 2],
  };

  it('puts one image of the cache at each slice of the reduced grid', () => {
    const imageIds = cacheFrames('volume-1', [10, 20, 30, 40]);
    const store = provideReducedImages({
      grid,
      sourceImageIds: imageIds,
      factors: [2, 2, 2],
      dataType: 'Uint16Array',
    });

    expect(store.imageIds).toEqual([
      `reduced:2x2x2:average:${imageIds[0]}`,
      `reduced:2x2x2:average:${imageIds[2]}`,
    ]);

    const first = cache.getImage(store.imageIds[0]);

    expect(first.columns).toBe(2);
    expect(first.rows).toBe(2);
    expect(first.getPixelData().length).toBe(4);
    expect(first.columnPixelSpacing).toBe(2);

    // The origin of the grid already carries the half-voxel offset of the box
    // average, and the k axis carries the position of each slice, so a consumer
    // that transforms through the image plane of a slice needs no new code.
    expect(
      metaData.get(MetadataModules.IMAGE_PLANE, store.imageIds[0])
        .imagePositionPatient
    ).toEqual([10.5, 20.5, 31]);
    expect(
      metaData.get(MetadataModules.IMAGE_PLANE, store.imageIds[1])
        .imagePositionPatient
    ).toEqual([10.5, 20.5, 35]);
  });

  it('gives a voxel manager that reads those images and owns no array', () => {
    const imageIds = cacheFrames('volume-2', [10, 20, 30, 40]);
    const store = provideReducedImages({
      grid,
      sourceImageIds: imageIds,
      factors: [2, 2, 2],
      dataType: 'Uint16Array',
    });

    cache.getImage(store.imageIds[1]).getPixelData()[3] = 77;

    expect(store.voxelManager.getAtIJK(1, 1, 1)).toBe(77);
  });

  it('reuses an image that the cache already holds', () => {
    const imageIds = cacheFrames('volume-3', [10, 20, 30, 40]);
    const options = {
      grid,
      sourceImageIds: imageIds,
      factors: [2, 2, 2],
      dataType: 'Uint16Array',
    };
    const first = provideReducedImages(options);

    cache.getImage(first.imageIds[0]).getPixelData()[0] = 99;

    const second = provideReducedImages(options);

    expect(second.imageIds).toEqual(first.imageIds);
    expect(second.voxelManager.getAtIJK(0, 0, 0)).toBe(99);
  });

  it('keeps an array of its own for an element type that no image holds', () => {
    const imageIds = cacheFrames('volume-4', [10, 20, 30, 40]);

    expect(
      provideReducedImages({
        grid,
        sourceImageIds: imageIds,
        factors: [2, 2, 2],
        dataType: 'Float64Array',
      })
    ).toBeUndefined();
  });
});

describe('a derivation of ImageVolume', () => {
  it('stores the reduced voxels in the image cache', () => {
    const imageIds = cacheFrames('volume-5', [10, 20, 30, 40]);
    const volume = makeVolume('volume-5', imageIds);
    const representation = volume.createVoxelRepresentation({
      factors: [2, 2, 2],
    });

    expect(representation.imageIds).toHaveLength(2);
    expect(representation.imageIds[0]).toBe(
      `reduced:2x2x2:average:${imageIds[0]}`
    );

    // Each box holds 2 x 2 x 2 source voxels, and the two frames of the first
    // box hold 10 and 20, so the average of every box of that slice is 15.
    expect(
      Array.from(cache.getImage(representation.imageIds[0]).getPixelData())
    ).toEqual([15, 15, 15, 15]);
    expect(
      Array.from(cache.getImage(representation.imageIds[1]).getPixelData())
    ).toEqual([35, 35, 35, 35]);
  });

  it('exempts a reduced slice from the eviction of the cache, as a frame of the volume is exempt', () => {
    const imageIds = cacheFrames('volume-6', [10, 20, 30, 40]);
    const volume = makeVolume('volume-6', imageIds);
    const representation = volume.createVoxelRepresentation({
      factors: [2, 2, 2],
    });

    expect(
      cache.getCachedImageBasedOnImageURI(representation.imageIds[0])
        ?.sharedCacheKey
    ).toBe('volume-6');
  });

  it('counts the reduced voxels in the one cache', () => {
    const imageIds = cacheFrames('volume-7', [10, 20, 30, 40]);
    const volume = makeVolume('volume-7', imageIds);
    const before = cache.getCacheSize();

    volume.createVoxelRepresentation({ factors: [2, 2, 2] });

    // Two slices of 2 x 2 voxels of two bytes each.
    expect(cache.getCacheSize() - before).toBe(16);
  });
});
