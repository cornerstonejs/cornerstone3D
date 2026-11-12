import { describe, it, expect } from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';

const { BaseAdapter3D } = Cornerstone3DSR;

const ctVolumeId = 'cornerstoneStreamingImageVolume:ctVolume';
const ptVolumeId = 'cornerstoneStreamingImageVolume:ptVolume';
const viewPlaneNormal = [0, 0, 1];

function getViewReferenceId(volumeId, sliceIndex) {
  return utilities.getVolumeViewReferenceId({
    volumeId,
    sliceIndex,
    viewPlaneNormal,
  });
}

describe('BaseAdapter3D.getCachedStats', () => {
  it('uses the imageId stats before any volume stats', () => {
    const imageStats = { mean: 1 };
    const cachedStats = {
      [getViewReferenceId(ctVolumeId, 5)]: { mean: 2 },
      'imageId:image1': imageStats,
    };
    const metadata = {
      referencedImageId: 'image1',
      volumeId: ctVolumeId,
      sliceIndex: 5,
      viewPlaneNormal,
    };

    expect(BaseAdapter3D.getCachedStats(cachedStats, metadata)).toBe(
      imageStats
    );
  });

  it('uses the view reference key of the annotation', () => {
    const viewStats = { mean: 2 };
    const cachedStats = {
      [getViewReferenceId(ctVolumeId, 3)]: { mean: 3 },
      [getViewReferenceId(ctVolumeId, 5)]: viewStats,
    };
    const metadata = { volumeId: ctVolumeId, sliceIndex: 5, viewPlaneNormal };

    expect(BaseAdapter3D.getCachedStats(cachedStats, metadata)).toBe(viewStats);
  });

  it('uses another key of the same volume when the view key is missing', () => {
    const ctStats = { mean: 3 };
    const cachedStats = {
      [getViewReferenceId(ptVolumeId, 5)]: { mean: 4 },
      [getViewReferenceId(ctVolumeId, 3)]: ctStats,
    };
    const metadata = { volumeId: ctVolumeId, sliceIndex: 5, viewPlaneNormal };

    expect(BaseAdapter3D.getCachedStats(cachedStats, metadata)).toBe(ctStats);
  });

  it('returns an empty object when only another volume has stats', () => {
    const cachedStats = { [getViewReferenceId(ptVolumeId, 5)]: { mean: 4 } };
    const metadata = { volumeId: ctVolumeId, sliceIndex: 5, viewPlaneNormal };

    expect(BaseAdapter3D.getCachedStats(cachedStats, metadata)).toEqual({});
  });

  it('returns an empty object when the metadata has no volumeId', () => {
    const cachedStats = { [getViewReferenceId(ptVolumeId, 5)]: { mean: 4 } };

    expect(BaseAdapter3D.getCachedStats(cachedStats, {})).toEqual({});
  });

  it('returns an empty object when no stats match', () => {
    const metadata = { referencedImageId: 'image1' };

    expect(BaseAdapter3D.getCachedStats({}, metadata)).toEqual({});
  });
});
