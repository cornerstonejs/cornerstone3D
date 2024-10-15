import type { PolyDataClipCacheType } from '../../../helpers/clipAndCacheSurfacesForViewport';
import type { RawContourData } from '../contourComputationStrategies';

/**
 * Extracts contour data from the given polyDataCache.
 * @param polyDataCache - The polyData cache containing intersection information.
 * @param segmentIndexMap - Optional map for mapping surface IDs to segment indices.
 * @returns A map of segment indices to an array of contour results.
 */
export function extractContourData(polyDataCache: PolyDataClipCacheType) {
  const rawResults = new Map() as RawContourData;

  for (const [cacheId, intersectionInfo] of polyDataCache) {
    const splits = cacheId.split('-');
    const segmentIndex = Number(splits[splits.length - 1]);

    for (const [_, result] of intersectionInfo) {
      if (!result) {
        continue;
      }

      if (!rawResults.has(segmentIndex)) {
        rawResults.set(segmentIndex, []);
      }

      rawResults.get(segmentIndex).push(result);
    }
  }
  return rawResults;
}
