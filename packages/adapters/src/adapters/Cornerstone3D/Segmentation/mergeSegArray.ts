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

export const mergeNewArrayWithoutInformationLoss = ({
    arrayOfLabelMapImages,
    newLabelMapImages
}) => {
    if (arrayOfLabelMapImages.length === 0) {
        arrayOfLabelMapImages.push(newLabelMapImages);
        return;
    }

    for (
        let currentTestedIndex = 0;
        currentTestedIndex < arrayOfLabelMapImages.length;
        currentTestedIndex++
    ) {
        const currentTestedArray = arrayOfLabelMapImages[currentTestedIndex];

        const originalArrayIsLarger =
            currentTestedArray.length > newLabelMapImages.length;
        const largerArray = originalArrayIsLarger
            ? currentTestedArray
            : newLabelMapImages;

        const hasOverlapping = checkHasOverlapping({
            currentTestedArray,
            largerArray,
            newArray: newLabelMapImages
        });

        if (hasOverlapping) {
            continue;
        }

        largerArray.forEach((_, currentImageIndex) => {
            const originalImagePixelData =
                currentTestedArray[currentImageIndex];
            const newImagePixelData = newLabelMapImages[currentImageIndex];

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

    arrayOfLabelMapImages.push(newLabelMapImages);
};
