const checkHasOverlapping = ({ largerArray, currentTestedArray, newArray }) =>
    largerArray.some((_, currentImageIndex) => {
        const originalImagePixelData = currentTestedArray[currentImageIndex];

        const newImagePixelData = newArray[currentImageIndex];

        if (!originalImagePixelData || !newImagePixelData) {
            return false;
        }

        return originalImagePixelData.some(
            (originalPixel, currentPixelIndex) => {
                const newPixel = newImagePixelData[currentPixelIndex];
                return originalPixel && newPixel;
            }
        );
    });

export const compactMergeSegmentDataWithoutInformationLoss = ({
    arrayOfSegmentData,
    newSegmentData
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
            newArray: newSegmentData
        });

        if (hasOverlapping) {
            continue;
        }

        largerArray.forEach((_, currentImageIndex) => {
            const originalImagePixelData =
                currentTestedArray[currentImageIndex];
            const newImagePixelData = newSegmentData[currentImageIndex];

            if (
                (!originalImagePixelData && !newImagePixelData) ||
                !newImagePixelData
            ) {
                return;
            }

            if (!originalImagePixelData) {
                currentTestedArray[currentImageIndex] = newImagePixelData;
                return;
            }

            const mergedPixelData = originalImagePixelData.map(
                (originalPixel, currentPixelIndex) => {
                    const newPixel = newImagePixelData[currentPixelIndex];
                    return originalPixel || newPixel;
                }
            );

            currentTestedArray[currentImageIndex] = mergedPixelData;
        });
        return;
    }

    arrayOfSegmentData.push(newSegmentData);
};
