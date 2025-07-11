import { utilities } from '@cornerstonejs/core';

export function splitImageIdsArray(imageIds: string[]) {
  const imageIdsGroups = [];
  const numberOfImages = utilities.getNumberOfReferenceImageIds(imageIds);
  if (imageIds.length > numberOfImages) {
    // Multi-volume: split flat array
    const numVolumes = Math.floor(imageIds.length / numberOfImages);
    for (let i = 0; i < numVolumes; i++) {
      const ids = imageIds.slice(i * numberOfImages, (i + 1) * numberOfImages);
      imageIdsGroups.push(ids);
    }
  } else {
    imageIdsGroups.push(imageIds);
  }
  return imageIdsGroups;
}
