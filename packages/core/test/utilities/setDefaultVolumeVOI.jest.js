import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getDefaultVolumeVOI,
  getDefaultVolumeVOIRange,
  getVolumeVOIShape,
} from '../../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import * as metaData from '../../src/metaData';
import { MetadataModules } from '../../src/enums';

// imageIds that no loader can resolve, so the min/max fallback cannot run and
// the assertions only see what the metadata produced
const imageIds = ['test:0', 'test:1', 'test:2', 'test:3', 'test:4'];
const volume = { imageIds, metadata: { Modality: 'CT' } };

function provideVOI(voiByImageId) {
  const provider = (type, imageId) =>
    type === MetadataModules.VOI_LUT ? voiByImageId[imageId] : undefined;

  metaData.addProvider(provider, 10000);

  return provider;
}

describe('getDefaultVolumeVOIRange', function () {
  let provider;

  afterEach(() => {
    if (provider) {
      metaData.removeProvider(provider);
      provider = undefined;
    }
  });

  it('accepts a window center of 0', async () => {
    // A center of 0 is a perfectly good window - it used to be tested for
    // truthiness, so those series fell through to a min/max range
    provider = provideVOI({
      'test:2': { windowWidth: 400, windowCenter: 0 },
    });

    await expect(getDefaultVolumeVOIRange(volume)).resolves.toEqual({
      lower: -200,
      upper: 199,
    });
  });

  it('walks outwards when the middle instance has no window', async () => {
    provider = provideVOI({
      'test:3': { windowWidth: 400, windowCenter: 0 },
    });

    await expect(getDefaultVolumeVOIRange(volume)).resolves.toEqual({
      lower: -200,
      upper: 199,
    });
  });

  it('skips an instance whose window width is 0', async () => {
    provider = provideVOI({
      'test:2': { windowWidth: 0, windowCenter: 40 },
      'test:3': { windowWidth: 400, windowCenter: 0 },
    });

    await expect(getDefaultVolumeVOIRange(volume)).resolves.toEqual({
      lower: -200,
      upper: 199,
    });
  });

  it('prefers the PT 0-5 range over a window the metadata carries', async () => {
    // cornerstone3D#1806: PT window width/center is expressed in the unscaled
    // counts, so applying it to SUV values blacks out the volume. The override
    // used to run only when the metadata had no window at all, leaving the
    // volume viewport disagreeing with the stack viewport
    provider = provideVOI({
      'test:2': { windowWidth: 30000, windowCenter: 15000 },
    });

    const ptVolume = {
      imageIds,
      metadata: { Modality: 'PT' },
      isPreScaled: true,
      scaling: { PT: { suvbw: 1 } },
    };

    await expect(getDefaultVolumeVOIRange(ptVolume)).resolves.toEqual({
      lower: 0,
      upper: 5,
    });
  });

  it('prefers the PT 0-5 range for a volume with no imageIds', async () => {
    // Such a volume takes its window from its own metadata rather than from an
    // instance. Scaling is a property of the volume, not of how its window was
    // found, so the override has to apply on that path too
    const ptVolume = {
      imageIds: [],
      metadata: {
        Modality: 'PT',
        voiLut: [{ windowWidth: 30000, windowCenter: 15000 }],
      },
      isPreScaled: true,
      scaling: { PT: { suvbw: 1 } },
    };

    await expect(getDefaultVolumeVOIRange(ptVolume)).resolves.toEqual({
      lower: 0,
      upper: 5,
    });
  });

  it('leaves an unscaled PT volume on its metadata window', async () => {
    // Only a prescaled PT gets the SUV range - without scaling the counts are
    // what the window describes
    provider = provideVOI({
      'test:2': { windowWidth: 400, windowCenter: 0 },
    });

    await expect(
      getDefaultVolumeVOIRange({ imageIds, metadata: { Modality: 'PT' } })
    ).resolves.toEqual({ lower: -200, upper: 199 });
  });

  it('does not throw for a volume with neither imageIds nor a window', async () => {
    await expect(
      getDefaultVolumeVOIRange({ imageIds: [], metadata: {} })
    ).resolves.toBeUndefined();
  });

  it('gives the VOI LUT Function of the instance to the viewport', async () => {
    // The volume viewport reads the function from the shape to make a sigmoid
    // transfer function. Before, it always made a linear one
    provider = provideVOI({
      'test:2': {
        windowWidth: 400,
        windowCenter: 0,
        voiLUTFunction: 'SIGMOID',
      },
    });

    expect(getVolumeVOIShape(volume).voiLUTFunction).toBe('SIGMOID');
    await expect(getDefaultVolumeVOI(volume)).resolves.toEqual({
      voiRange: { lower: -200, upper: 199 },
      voiLUT: undefined,
      voiLUTFunction: 'SIGMOID',
    });
  });

  it('takes the range from a VOI LUT Sequence of the instance', async () => {
    // The sequence is the whole VOI transformation, so its own input domain is
    // the range, and it wins over a window of the same instance (C.11.2.1)
    const voiLUT = {
      firstValueMapped: 100,
      numBitsPerEntry: 16,
      lut: [0, 8, 16, 24],
    };

    provider = provideVOI({
      'test:2': { windowWidth: 400, windowCenter: 0, voiLUTSequence: [voiLUT] },
    });

    await expect(getDefaultVolumeVOI(volume)).resolves.toEqual({
      voiRange: { lower: 100, upper: 103 },
      voiLUT,
      voiLUTFunction: undefined,
    });
  });

  it('ignores the VOI LUT Sequence of a prescaled PT volume', async () => {
    // The curve of the file is in the unscaled counts, and the volume holds SUV
    const voiLUT = {
      firstValueMapped: 0,
      numBitsPerEntry: 16,
      lut: [0, 8, 16],
    };

    provider = provideVOI({ 'test:2': { voiLUTSequence: [voiLUT] } });

    const ptVolume = {
      imageIds,
      metadata: { Modality: 'PT' },
      isPreScaled: true,
      scaling: { PT: { suvbw: 1 } },
    };

    expect(getVolumeVOIShape(ptVolume)).toEqual({});
    await expect(getDefaultVolumeVOI(ptVolume)).resolves.toEqual({
      voiRange: { lower: 0, upper: 5 },
    });
  });

  it('keeps the VOI LUT Function attached to the window', async () => {
    provider = provideVOI({
      'test:2': {
        windowWidth: 400,
        windowCenter: 0,
        voiLUTFunction: 'LINEAR_EXACT',
      },
    });

    // LINEAR_EXACT has no half pixel offsets: c - w/2 .. c + w/2
    await expect(getDefaultVolumeVOIRange(volume)).resolves.toEqual({
      lower: -200,
      upper: 200,
    });
  });
});
