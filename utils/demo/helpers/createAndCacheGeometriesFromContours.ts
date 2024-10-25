import { geometryLoader, Enums } from '@cornerstonejs/core';
import assetsURL from '../../assets/assetsURL.json';

/**
 * Creates and caches geometries from contours
 * @param contours - The contours data
 * @returns A Map of segment index to geometry ID
 */

export async function createAndCacheGeometriesFromContours(
  name: string
): Promise<string[]> {
  const data = await fetch(assetsURL[name]).then((res) => res.json());

  const geometryIds: string[] = [];
  data.contourSets.forEach((contourSet) => {
    const geometryId = contourSet.id;
    geometryIds.push(geometryId);
    return geometryLoader.createAndCacheGeometry(geometryId, {
      type: Enums.GeometryType.CONTOUR,
      geometryData: contourSet,
    });
  });

  return geometryIds;
}
