const checkHasOverlapping = ({ largerArray, currentTestedArray, newArray }) =>
  largerArray.some((_, currentImageIndex) => {
    const originalImagePixelData = currentTestedArray[currentImageIndex];

    const newImagePixelData = newArray[currentImageIndex];

    if (!originalImagePixelData || !newImagePixelData) {
      return false;
    }

    return originalImagePixelData.some((originalPixel, currentPixelIndex) => {
      const newPixel = newImagePixelData[currentPixelIndex];
      return originalPixel && newPixel;
    });
  });

export const compactMergeSegmentDataWithoutInformationLoss = ({
  arrayOfSegmentData,
  newSegmentData,
}) => {
  if (arrayOfSegmentData.length === 0) {
    arrayOfSegmentData.push(newSegmentData);
    return;
  }

  for (
    let currentTestedIndex = 0;
    currentTestedIndex < arrayOfSegmentData.length;
    currentTestedIndex++
  ) {
    const currentTestedArray = arrayOfSegmentData[currentTestedIndex];

    const originalArrayIsLarger =
      currentTestedArray.length > newSegmentData.length;
    const largerArray = originalArrayIsLarger
      ? currentTestedArray
      : newSegmentData;

    const hasOverlapping = checkHasOverlapping({
      currentTestedArray,
      largerArray,
      newArray: newSegmentData,
    });

    if (hasOverlapping) {
      continue;
    }

    // Iterate the index RANGE rather than one array's populated entries.
    //
    // getSegmentData() builds its result as a SPARSE array — segmentData[i] is assigned
    // only for images that actually hold voxels — and Array.prototype.forEach SKIPS HOLES.
    // Iterating `largerArray` therefore visited only the indices where that array had an
    // element. When the existing layer is the longer one, `largerArray` IS the existing
    // layer, so every image where only the INCOMING segment had data was never visited,
    // and was silently dropped.
    const mergeLength = Math.max(
      currentTestedArray.length,
      newSegmentData.length
    );

    for (
      let currentImageIndex = 0;
      currentImageIndex < mergeLength;
      currentImageIndex++
    ) {
      const originalImagePixelData = currentTestedArray[currentImageIndex];
      const newImagePixelData = newSegmentData[currentImageIndex];

      if (!newImagePixelData) {
        continue;
      }

      if (!originalImagePixelData) {
        currentTestedArray[currentImageIndex] = newImagePixelData;
        continue;
      }

      const mergedPixelData = originalImagePixelData.map(
        (originalPixel, currentPixelIndex) => {
          const newPixel = newImagePixelData[currentPixelIndex];
          return originalPixel || newPixel;
        }
      );

      currentTestedArray[currentImageIndex] = mergedPixelData;
    }
    return;
  }

  arrayOfSegmentData.push(newSegmentData);
};
