import getVOILUT from './getVOILut';
import { IImage, CPUFallbackLUT } from '../../../../types';

/**
 * Creates a LUT used while rendering to convert stored pixel values to
 * display pixels
 *
 * @param image - A Cornerstone Image Object
 * @param windowWidth - The Window Width
 * @param windowCenter - The Window Center
 * @param invert - A boolean describing whether or not the image has been inverted
 * @param voiLUT- A Volume of Interest Lookup Table
 *
 * @returns A lookup table to apply to the image
 */
export default function generateColorLUT(
  image: IImage,
  windowWidth: number | number[],
  windowCenter: number | number[],
  invert: boolean,
  voiLUT?: CPUFallbackLUT
) {
  const maxPixelValue = image.maxPixelValue;
  const minPixelValue = image.minPixelValue;
  const offset = Math.min(minPixelValue, 0);

  if (image.cachedLut === undefined) {
    const length = maxPixelValue - offset + 1;

    image.cachedLut = {};
    image.cachedLut.lutArray = new Uint8ClampedArray(length);
  }

  const lut = image.cachedLut.lutArray;
  const vlutfn = getVOILUT(
    Array.isArray(windowWidth) ? windowWidth[0] : windowWidth,
    Array.isArray(windowCenter) ? windowCenter[0] : windowCenter,
    voiLUT
  );

  if (invert === true) {
    for (
      let storedValue = minPixelValue;
      storedValue <= maxPixelValue;
      storedValue++
    ) {
      lut[storedValue + -offset] = 255 - vlutfn(storedValue);
    }
  } else {
    for (
      let storedValue = minPixelValue;
      storedValue <= maxPixelValue;
      storedValue++
    ) {
      lut[storedValue + -offset] = vlutfn(storedValue);
    }
  }

  return lut;
}
