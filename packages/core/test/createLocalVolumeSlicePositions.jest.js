import { describe, it, expect, afterEach } from '@jest/globals';

import cache from '../src/cache/cache';
import * as metaData from '../src/metaData';
import { createLocalVolume } from '../src/loaders/volumeLoader';
import getClosestImageId from '../src/utilities/getClosestImageId';
import transformIndexToWorld from '../src/utilities/transformIndexToWorld';

// An oblique volume with a non-zero origin and non-unit spacing. The row
// direction is rotated 30 degrees about z, the column direction is also tilted
// 20 degrees out of the axial plane, and k is their cross product.
const c = Math.cos(Math.PI / 6);
const s = Math.sin(Math.PI / 6);
const ct = Math.cos(Math.PI / 9);
const st = Math.sin(Math.PI / 9);
const direction = [c, s, 0, -s * ct, c * ct, st, s * st, -c * st, ct];
const origin = [-120.5, 33.25, -410];
const spacing = [0.7, 0.9, 2.5];

function makeVolume(volumeId, dimensions = [4, 3, 5]) {
  return createLocalVolume(volumeId, {
    metadata: {},
    dimensions,
    spacing,
    origin,
    direction,
    scalarData: new Float32Array(dimensions[0] * dimensions[1] * dimensions[2]),
  });
}

function getImagePlane(imageId) {
  return metaData.get('imagePlaneModule', imageId);
}

describe('createLocalVolume slice image metadata', () => {
  afterEach(() => {
    cache.purgeCache();
  });

  it('places each slice image at the position of its slice in the volume', () => {
    const volume = makeVolume('localVolumeSlicePositions');

    volume.imageIds.forEach((imageId, k) => {
      const expected = transformIndexToWorld(volume.imageData, [0, 0, k]);
      const { imagePositionPatient } = getImagePlane(imageId);

      expect(imagePositionPatient).toHaveLength(3);
      for (let axis = 0; axis < 3; axis++) {
        expect(imagePositionPatient[axis]).toBeCloseTo(expected[axis], 6);
      }
    });
  });

  it('lets getClosestImageId find the image of the slice at a world point', () => {
    const volume = makeVolume('localVolumeClosestImageId');
    const normal = direction.slice(6, 9);

    volume.imageIds.forEach((imageId, k) => {
      const worldPoint = transformIndexToWorld(volume.imageData, [1, 2, k]);

      expect(getClosestImageId(volume, worldPoint, normal)).toBe(imageId);
    });
  });

  // Guards: these hold before and after the fix.
  it('keeps the volume origin on the first slice and the orientation on every slice', () => {
    const volume = makeVolume('localVolumeFirstSlice');

    expect(getImagePlane(volume.imageIds[0]).imagePositionPatient).toEqual(
      origin
    );
    volume.imageIds.forEach((imageId) => {
      const { rowCosines, columnCosines } = getImagePlane(imageId);
      expect(rowCosines).toEqual(direction.slice(0, 3));
      expect(columnCosines).toEqual(direction.slice(3, 6));
    });
  });

  it('places a single-slice volume at the volume origin', () => {
    const volume = makeVolume('localVolumeSingleSlice', [4, 3, 1]);

    expect(volume.imageIds).toHaveLength(1);
    expect(getImagePlane(volume.imageIds[0]).imagePositionPatient).toEqual(
      origin
    );
  });

  it('does not change the origin array passed in by the caller', () => {
    const callerOrigin = [...origin];
    createLocalVolume('localVolumeCallerOrigin', {
      metadata: {},
      dimensions: [2, 2, 3],
      spacing,
      origin: callerOrigin,
      direction,
      scalarData: new Float32Array(12),
    });

    expect(callerOrigin).toEqual(origin);
  });
});
