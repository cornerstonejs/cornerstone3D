import { describe, it, expect } from '@jest/globals';
import coarseInterleavedRetrieveStages from '../../src/loaders/configuration/coarseInterleavedRetrieve';
import decimate from '../../src/utilities/decimate';
import { ImageQualityStatus } from '../../src/enums';

/**
 * Applies the stages in `stageIds`, with the fill rule of `fillNearbyFrames`:
 * a replicate replaces a frame only with a strictly higher quality. Within a
 * stage the images arrive in reverse order, to show the order does not matter.
 */
function loadStages(imageCount, stageIds) {
  const quality = new Array(imageCount);
  const source = new Array(imageCount).fill(-1);
  const loaded = [];

  const deliver = (index, stage) => {
    quality[index] = ImageQualityStatus.FULL_RESOLUTION;
    source[index] = index;
    loaded.push(index);
    for (const { offset, imageQualityStatus } of stage.nearbyFrames || []) {
      const target = index + offset;
      if (target < 0 || target >= imageCount) {
        continue;
      }
      if (
        quality[target] !== undefined &&
        quality[target] >= imageQualityStatus
      ) {
        continue;
      }
      quality[target] = imageQualityStatus;
      source[target] = index;
    }
  };

  for (const id of stageIds) {
    const stage = coarseInterleavedRetrieveStages.find((s) => s.id === id);
    const indices = stage.positions
      ? stage.positions.map((p) => Math.floor((imageCount - 1) * p))
      : decimate(new Array(imageCount), stage.decimate, stage.offset);
    indices.reverse().forEach((index) => deliver(index, stage));
  }

  return { quality, source, loaded };
}

describe('coarseInterleavedRetrieveStages', () => {
  it('fills every frame from its nearest loaded image after the coarse stages', () => {
    const imageCount = 2464;
    const { quality, source, loaded } = loadStages(imageCount, [
      'initialImages',
      'coarse64',
      'coarse64At21',
      'coarse64At42',
    ]);

    for (let index = 0; index < imageCount; index++) {
      expect(quality[index]).toBeDefined();
      const nearest = Math.min(...loaded.map((l) => Math.abs(l - index)));
      expect(Math.abs(source[index] - index)).toBe(nearest);
      expect(nearest).toBeLessThanOrEqual(11);
    }
  });

  it('keeps every replicate below the quality of a retrieved image', () => {
    for (const stage of coarseInterleavedRetrieveStages) {
      for (const { imageQualityStatus } of stage.nearbyFrames || []) {
        expect(imageQualityStatus).toBeGreaterThan(
          ImageQualityStatus.FAR_REPLICATE
        );
        expect(imageQualityStatus).toBeLessThanOrEqual(
          ImageQualityStatus.ADJACENT_REPLICATE
        );
      }
    }
  });
});
