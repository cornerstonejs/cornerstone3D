import { describe, it, expect } from '@jest/globals';
import coarseInterleavedRetrieveStages from '../../src/loaders/configuration/coarseInterleavedRetrieve';
import decimate from '../../src/utilities/decimate';
import { ImageQualityStatus } from '../../src/enums';

const decimateStages = coarseInterleavedRetrieveStages.filter(
  (stage) => stage.decimate
);

/**
 * Applies the stages in order, with the fill rule of `fillNearbyFrames`: a
 * replicate replaces a frame only with a strictly higher quality. Within a
 * stage the images arrive in reverse order, to show the order does not matter.
 * `afterStage` runs after each stage.
 */
function loadStages(imageCount, stages, afterStage) {
  const quality = new Array(imageCount);
  const source = new Array(imageCount).fill(-1);
  const loaded = [];

  const deliver = (index, stage) => {
    if (quality[index] === ImageQualityStatus.FULL_RESOLUTION) {
      return;
    }
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

  stages.forEach((stage, stageIndex) => {
    const indices = stage.positions
      ? stage.positions.map((p) =>
          p < 0 ? imageCount + p : Math.floor((imageCount - 1) * p)
        )
      : decimate(new Array(imageCount), stage.decimate, stage.offset);
    indices.reverse().forEach((index) => deliver(index, stage));
    afterStage?.(stageIndex, { quality, source, loaded });
  });

  return { quality, source, loaded };
}

describe('coarseInterleavedRetrieveStages', () => {
  it('has 64 decimate stages that retrieve every image once', () => {
    const imageCount = 2464;
    const retrieved = new Array(imageCount).fill(0);

    expect(decimateStages).toHaveLength(64);

    for (const stage of decimateStages) {
      for (const index of decimate(
        new Array(imageCount),
        stage.decimate,
        stage.offset
      )) {
        retrieved[index]++;
      }
    }

    expect(retrieved.every((count) => count === 1)).toBe(true);
  });

  it('halves the gap over the whole volume with each level of stages', () => {
    const imageCount = 2464;
    const stages = [coarseInterleavedRetrieveStages[0], ...decimateStages];
    // The stage index (in `stages`) that completes each level, and the
    // largest distance from a frame to its nearest retrieved image after it.
    const levelEnds = new Map([
      [1, 32],
      [2, 16],
      [4, 8],
      [8, 4],
      [16, 2],
      [32, 1],
      [64, 0],
    ]);

    loadStages(
      imageCount,
      stages,
      (stageIndex, { quality, source, loaded }) => {
        const maxDistance = levelEnds.get(stageIndex);

        if (maxDistance === undefined) {
          return;
        }

        for (let index = 0; index < imageCount; index++) {
          expect(quality[index]).toBeDefined();
          const nearest = Math.min(...loaded.map((l) => Math.abs(l - index)));
          expect(Math.abs(source[index] - index)).toBe(nearest);
          expect(nearest).toBeLessThanOrEqual(maxDistance);
        }
      }
    );
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
