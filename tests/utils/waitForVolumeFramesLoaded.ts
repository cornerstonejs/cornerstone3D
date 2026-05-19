import type { Page } from '@playwright/test';

/** Matches `ImageQualityStatus.FULL_RESOLUTION` in @cornerstonejs/core */
const FULL_RESOLUTION = 8;

type WaitForVolumeFramesLoadedOptions = {
  timeout?: number;
};

/**
 * Waits until all frames in [startIndex, endIndex] are fully loaded on a
 * streaming volume. Use after jumpToSlice when tests depend on voxel data
 * (e.g. ROI threshold statistics).
 */
export const waitForVolumeFramesLoaded = async (
  page: Page,
  volumeId: string,
  startIndex: number,
  endIndex: number,
  options: WaitForVolumeFramesLoadedOptions = {}
) => {
  const { timeout = 60000 } = options;

  await page.waitForFunction(
    ({ volumeId, startIndex, endIndex, fullResolution }) => {
      const cornerstone = (window as { cornerstone?: { cache?: { getVolume: (id: string) => unknown } } })
        .cornerstone;
      const volume = cornerstone?.cache?.getVolume(volumeId) as
        | { cachedFrames?: number[] }
        | undefined;

      if (!volume?.cachedFrames?.length) {
        return false;
      }

      for (let i = startIndex; i <= endIndex; i++) {
        if (volume.cachedFrames[i] !== fullResolution) {
          return false;
        }
      }

      return true;
    },
    { volumeId, startIndex, endIndex, fullResolution: FULL_RESOLUTION },
    { timeout }
  );
};
