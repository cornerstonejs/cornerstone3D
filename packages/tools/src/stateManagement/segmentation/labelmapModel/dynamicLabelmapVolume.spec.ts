import { cache, metaData } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  createDynamicLabelmapVolume,
  syncDynamicLabelmapVolume,
} from './dynamicLabelmapVolume';

const TIME_POINTS = 2;
// Unsorted on purpose: the volume sorts each time point by position.
const POSITIONS = [2, 0, 1];

const ids = (prefix: string, timePoints = TIME_POINTS) =>
  Array.from({ length: timePoints }, (_, t) =>
    POSITIONS.map((z) => `${prefix}:${t}:${z}`)
  ).flat();

function provider(type: string, imageId: string) {
  const [prefix, t, z] = imageId.split(':');

  if (type === 'imagePlaneModule') {
    return {
      imagePositionPatient: [0, 0, Number(z)],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [1, 1],
      rows: 2,
      columns: 2,
      frameOfReferenceUID: 'for',
    };
  }
  if (type === 'imagePixelModule') {
    return {
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 7,
      pixelRepresentation: 0,
      photometricInterpretation: 'MONOCHROME2',
      samplesPerPixel: 1,
    };
  }
  if (type === 'generalSeriesModule') {
    return { modality: 'SEG', seriesInstanceUID: 'series' };
  }
  if (type === 'TemporalPositionIdentifier' && prefix.startsWith('ref')) {
    return Number(t) + 1;
  }
}

/** The part of a dynamic image volume that the sync reads. */
const imageVolumeAt = (timePoint: number) =>
  ({
    getCurrentDimensionGroupImageIds: () =>
      POSITIONS.map((z) => `ref:${timePoint}:${z}`),
  }) as unknown as Types.IImageVolume;

describe('dynamic labelmap volume', () => {
  beforeEach(() => metaData.addProvider(provider, 10000));
  afterEach(() => {
    metaData.removeProvider(provider);
    cache.purgeCache();
  });

  it('is one volume of one time point that follows the image volume', () => {
    const volume = createDynamicLabelmapVolume('labelmap-4d', {
      labelmapId: 'labelmap',
      imageIds: ids('lm'),
      referencedImageIds: ids('ref'),
    });

    expect(cache.getVolume('labelmap-4d')).toBe(volume);
    expect(volume.dimensions).toEqual([2, 2, 3]);
    expect(volume.isDynamicVolume()).toBe(false);
    expect(volume.imageIds).toEqual(['lm:0:0', 'lm:0:1', 'lm:0:2']);

    expect(syncDynamicLabelmapVolume(volume, imageVolumeAt(1))).toBe(true);
    expect(volume.imageIds).toEqual(['lm:1:0', 'lm:1:1', 'lm:1:2']);
    expect(volume.referencedImageIds).toEqual([
      'ref:1:0',
      'ref:1:1',
      'ref:1:2',
    ]);

    expect(syncDynamicLabelmapVolume(volume, imageVolumeAt(1))).toBe(false);
  });

  it('leaves a 3D labelmap to the static volume', () => {
    expect(
      createDynamicLabelmapVolume('labelmap-3d', {
        labelmapId: 'labelmap',
        imageIds: ids('lm', 1),
        referencedImageIds: ids('ref', 1),
      })
    ).toBeUndefined();
  });
});
