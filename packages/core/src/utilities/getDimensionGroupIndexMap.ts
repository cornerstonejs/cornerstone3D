import { utilities as metadataUtilities } from '@cornerstonejs/metadata';

/**
 * Splits imageIds into their 4D dimension groups (time point, b-value, echo,
 * ...) and returns a map from each imageId to the index of the group it belongs
 * to.
 *
 * Returns undefined when the imageIds do not form a 4D set, so callers can tell
 * "everything is in one group" apart from "these two images are in different
 * groups" without having to inspect the map.
 *
 * Note this reads the 4D metadata of every imageId, so callers that use it on a
 * hot path should cache the result for as long as the imageIds are unchanged.
 *
 * @param imageIds - the imageIds to split
 * @returns imageId to dimension group index, or undefined if not 4D
 */
export default function getDimensionGroupIndexMap(
  imageIds: string[]
): Map<string, number> | undefined {
  if (!imageIds || imageIds.length < 2) {
    return;
  }

  const { imageIdGroups } =
    metadataUtilities.splitImageIdsBy4DTags(imageIds) ?? {};

  if (!imageIdGroups || imageIdGroups.length < 2) {
    return;
  }

  const dimensionGroupIndexMap = new Map<string, number>();

  imageIdGroups.forEach((imageIdGroup, groupIndex) => {
    imageIdGroup.forEach((imageId) => {
      dimensionGroupIndexMap.set(imageId, groupIndex);
    });
  });

  return dimensionGroupIndexMap;
}

/**
 * Returns true only when both imageIds are known to sit in different dimension
 * groups. An unknown imageId - one from another series, or from a set that is
 * not 4D at all - means the dimension groups cannot be compared, which reads as
 * "not different" so callers fall back to whatever else they were using.
 *
 * @param dimensionGroupIndexMap - map from getDimensionGroupIndexMap, may be undefined
 * @param imageIdA - first imageId to compare
 * @param imageIdB - second imageId to compare
 */
export function areInDifferentDimensionGroups(
  dimensionGroupIndexMap: Map<string, number> | undefined,
  imageIdA: string,
  imageIdB: string
): boolean {
  if (!dimensionGroupIndexMap) {
    return false;
  }

  const groupA = dimensionGroupIndexMap.get(imageIdA);
  const groupB = dimensionGroupIndexMap.get(imageIdB);

  return groupA !== undefined && groupB !== undefined && groupA !== groupB;
}
