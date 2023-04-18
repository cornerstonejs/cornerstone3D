import splitImageIdsBy4DTags from './splitImageIdsBy4DTags';

/**
 * Get some info about 4D image sets. Time points (groups of imageIds) are
 * returned when the imageIds represents a 4D volume.
 * @param imageIds - Array of Cornerstone Image Object's imageIds
 * @returns 4D series infos
 */
function getDynamicVolumeInfo(imageIds) {
  const timePoints = splitImageIdsBy4DTags(imageIds);
  const isDynamicVolume = timePoints.length > 1;

  return { isDynamicVolume, timePoints };
}

export default getDynamicVolumeInfo;
