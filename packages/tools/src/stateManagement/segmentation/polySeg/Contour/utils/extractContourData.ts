import type { PolyDataClipCacheType } from '../../../helpers/clipAndCacheSurfacesForViewport';
import type { RawContourData } from '../contourComputationStrategies';

/**
 * Extracts contour data from the given polyDataCache.
 * @param polyDataCache - The polyData cache containing intersection information.
 * @param segmentIndexMap - Optional map for mapping surface IDs to segment indices.
 * @returns A map of segment indices to an array of contour results.
 */
export function extractContourData(
  polyDataCache: PolyDataClipCacheType,
  segmentIndexMap?: Map<string, number>
) {
  const rawResults = new Map() as RawContourData;

  for (const [cacheId, intersectionInfo] of polyDataCache) {
    // Todo; fix this
    let segmentIndex;
    const surfaceId = cacheId.split('-')[1];
    if (!segmentIndexMap) {
      segmentIndex = Number(surfaceId.split('_')[1]);
    } else {
      segmentIndex = segmentIndexMap.get(surfaceId.split('_')[1]);
    }

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
