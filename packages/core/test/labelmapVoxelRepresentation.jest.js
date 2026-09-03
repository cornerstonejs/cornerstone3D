import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { getConfiguration, setConfiguration } from '../src/init';
import {
  createAndCacheLocalImage,
  getDefaultLabelmapVoxelRepresentation,
} from '../src/loaders/imageLoader';
import VoxelManagerEnum from '../src/enums/VoxelManagerEnum';
import cache from '../src/cache/cache';

/**
 * `segmentation.labelmapVoxelRepresentation` is what a deployment sets to move
 * labelmaps onto the RLE representation, so it has to behave for a value that
 * arrived as a plain string out of a host's configuration, and it has to fail
 * loudly rather than quietly doing nothing.
 */
describe('getDefaultLabelmapVoxelRepresentation', () => {
  const original = getConfiguration();

  afterEach(() => {
    setConfiguration(original);
    jest.restoreAllMocks();
  });

  function configure(labelmapVoxelRepresentation) {
    setConfiguration({
      ...original,
      segmentation: { labelmapVoxelRepresentation },
    });
  }

  it('defaults to Volume so an unconfigured deployment is unchanged', () => {
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
  });

  it('defaults to Volume when the config has no segmentation section at all', () => {
    setConfiguration({ ...original, segmentation: undefined });
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
  });

  it('accepts the enum member', () => {
    configure(VoxelManagerEnum.RLE);
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(VoxelManagerEnum.RLE);
  });

  it('accepts the bare string, as a JSON configuration would supply it', () => {
    configure('RLE');
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(VoxelManagerEnum.RLE);

    configure('Volume');
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
  });

  it('warns and falls back to Volume on an unrecognized value', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    // Wrong case is the likely typo, and the one that used to be a silent no-op.
    configure('rle');

    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rle'));
  });
});

/**
 * Choosing RLE is meant to be a decision about how the voxels are stored, not
 * one that changes what the image holds. The RLE map is created empty, so a
 * caller that supplied real voxels had them silently dropped - `getPixelData()`
 * expanded the empty map instead of the buffer that was passed in.
 */
describe('createAndCacheLocalImage with the RLE representation', () => {
  const [width, height] = [4, 4];
  const frameSize = width * height;
  const geometry = { dimensions: [width, height], spacing: [1, 1] };
  const imageIds = [];

  function createImage(imageId, options) {
    imageIds.push(imageId);
    return createAndCacheLocalImage(imageId, { ...geometry, ...options });
  }

  afterEach(() => {
    imageIds.splice(0).forEach((imageId) => {
      cache.removeImageLoadObject(imageId);
    });
  });

  it('keeps voxels the caller supplied', () => {
    const scalarData = new Uint8Array(frameSize);
    scalarData[0] = 3;
    scalarData[7] = 9;

    const image = createImage('rle-populated', {
      scalarData,
      voxelRepresentation: VoxelManagerEnum.RLE,
    });

    const pixelData = image.getPixelData();
    expect(pixelData[0]).toBe(3);
    expect(pixelData[7]).toBe(9);
    expect(Array.from(pixelData).filter((value) => value !== 0)).toHaveLength(
      2
    );
    // The RLE map, not the supplied buffer, is the source of truth afterwards.
    expect(image.voxelManager.getAtIndex(7)).toBe(9);
    expect(image.voxelManager.getLiveScalarData()).toBeUndefined();
  });

  it('agrees with the Volume representation on the same data', () => {
    const scalarData = new Uint8Array(frameSize);
    scalarData[5] = 4;

    const rle = createImage('rle-vs-volume-rle', {
      scalarData: scalarData.slice(),
      voxelRepresentation: VoxelManagerEnum.RLE,
    });
    const volume = createImage('rle-vs-volume-volume', {
      scalarData: scalarData.slice(),
      voxelRepresentation: VoxelManagerEnum.Volume,
    });

    expect(Array.from(rle.getPixelData())).toEqual(
      Array.from(volume.getPixelData())
    );
  });

  it('does not scan the stand-in buffer a derived RLE image passes', () => {
    // createAndCacheDerivedImage hands an RLE image a 1-element buffer that
    // holds no voxels, purely so the bit-depth metadata has a type to read.
    // Treating it as data would both be wrong and cost a full-frame scan.
    const image = createImage('rle-stand-in', {
      scalarData: new Uint8Array(1),
      voxelRepresentation: VoxelManagerEnum.RLE,
    });

    const pixelData = image.getPixelData();
    expect(pixelData).toHaveLength(frameSize);
    expect(Array.from(pixelData).every((value) => value === 0)).toBe(true);
  });
});
