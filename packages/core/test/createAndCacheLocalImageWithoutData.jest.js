import { describe, it, expect, afterEach } from '@jest/globals';
import { createAndCacheLocalImage } from '../src/loaders/imageLoader';
import VoxelManagerEnum from '../src/enums/VoxelManagerEnum';
import cache from '../src/cache/cache';

/**
 * Row 287 of `v6-open-issues.md`: `createAndCacheLocalImage` without
 * `scalarData` makes an empty image of the size of `dimensions` and of the
 * type of `targetBuffer` (Float32Array when no type is given), as its options
 * say. With `skipCreateBuffer` it makes the short stand-in buffer that the
 * option describes.
 */
describe('createAndCacheLocalImage without scalarData', () => {
  const imageIds = [];

  function createImage(imageId, options) {
    imageIds.push(imageId);
    return createAndCacheLocalImage(imageId, {
      dimensions: [5, 3],
      spacing: [1, 2],
      ...options,
    });
  }

  afterEach(() => {
    imageIds.splice(0).forEach((imageId) => {
      cache.removeImageLoadObject(imageId);
    });
  });

  it('makes an empty image of the size and type of the options', () => {
    const image = createImage('local-empty-uint8', {
      targetBuffer: { type: 'Uint8Array' },
    });
    const pixelData = image.getPixelData();

    expect(pixelData).toBeInstanceOf(Uint8Array);
    expect(pixelData.length).toBe(15);
    expect(Array.from(pixelData).every((value) => value === 0)).toBe(true);
    expect(image.columns).toBe(5);
    expect(image.rows).toBe(3);
    expect(image.numberOfComponents).toBe(1);
    expect(image.color).toBe(false);
    expect(image.minPixelValue).toBe(0);
    expect(image.maxPixelValue).toBe(0);
    expect(image.sizeInBytes).toBe(15);
    expect(image.dataType).toBe('Uint8Array');
    expect(image.voxelManager.getAtIJK(4, 2, 0)).toBe(0);
    expect(cache.getImage('local-empty-uint8')).toBe(image);
  });

  it('makes a Float32Array image when no type is given', () => {
    const image = createImage('local-empty-default', {});

    expect(image.getPixelData()).toBeInstanceOf(Float32Array);
    expect(image.getPixelData().length).toBe(15);
    expect(image.sizeInBytes).toBe(60);
  });

  it('makes an empty RLE image', () => {
    const image = createImage('local-empty-rle', {
      targetBuffer: { type: 'Uint8Array' },
      voxelRepresentation: VoxelManagerEnum.RLE,
    });

    expect(image.voxelManager.getAtIJK(1, 1, 0)).toBe(0);
    image.voxelManager.setAtIJK(1, 1, 0, 4);
    expect(image.voxelManager.getAtIJK(1, 1, 0)).toBe(4);
  });

  it('makes the short stand-in buffer with skipCreateBuffer', () => {
    const image = createImage('local-empty-skip', {
      targetBuffer: { type: 'Uint16Array' },
      skipCreateBuffer: true,
    });

    expect(image.getPixelData()).toBeInstanceOf(Uint16Array);
    expect(image.getPixelData().length).toBe(1);
    expect(image.columns).toBe(5);
    expect(image.rows).toBe(3);
  });
});
