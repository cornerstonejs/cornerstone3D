export function splitImageIdsArray(imageIds: string[], numerOfImages: number) {
  const imageIdsGroups = [];
  if (imageIds.length > numerOfImages) {
    // Multi-volume: split flat array
    const numVolumes = Math.floor(imageIds.length / numerOfImages);
    for (let i = 0; i < numVolumes; i++) {
      const ids = imageIds.slice(i * numerOfImages, (i + 1) * numerOfImages);
      imageIdsGroups.push(ids);
    }
  } else {
    imageIdsGroups.push(imageIds);
  }
  return imageIdsGroups;
}
