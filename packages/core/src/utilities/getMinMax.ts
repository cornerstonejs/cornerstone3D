/**
 * Calculate the minimum and maximum values in an Array
 *
 * @param storedPixelData - The pixel data to calculate the min and max values for
 * @returns an object with two properties: min and max
 */
export default function getMinMax(storedPixelData: number[]): {
  min: number;
  max: number;
} {
  // we always calculate the min max values since they are not always
  // present in DICOM and we don't want to trust them anyway as cornerstone
  // depends on us providing reliable values for these
  let min = storedPixelData[0];

  let max = storedPixelData[0];

  let storedPixel;
  const numPixels = storedPixelData.length;

  for (let index = 1; index < numPixels; index++) {
    storedPixel = storedPixelData[index];
    min = Math.min(min, storedPixel);
    max = Math.max(max, storedPixel);
  }

  return {
    min,
    max,
  };
}
