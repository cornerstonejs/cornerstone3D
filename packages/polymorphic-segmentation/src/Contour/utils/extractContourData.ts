import type { PolyDataClipCacheType } from '../../utilities/clipAndCacheSurfacesForViewport';
import type { RawContourData } from '../contourComputationStrategies';

/**
 * Extracts contour data from the given polyDataCache.
 * @param polyDataCache - The polyData cache containing intersection information.
 * @param segmentIndexMap - Optional map for mapping surface IDs to segment indices.
 * @returns A map of segment indices to an array of contour results.
 */
export function extractContourData(polyDataCache: PolyDataClipCacheType) {
  const rawResults = new Map() as RawContourData;

  for (const [segmentIndex, intersectionInfo] of polyDataCache) {
    const segmentIndexNumber = Number(segmentIndex);

    for (const [_, result] of intersectionInfo) {
      if (!result) {
        continue;
      }

      if (!rawResults.has(segmentIndexNumber)) {
        rawResults.set(segmentIndexNumber, []);
      }

      rawResults.get(segmentIndexNumber).push(result);
    }
  }
  return rawResults;
}
