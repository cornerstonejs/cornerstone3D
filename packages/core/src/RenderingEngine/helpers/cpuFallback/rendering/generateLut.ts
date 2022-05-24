import getModalityLut from './getModalityLut';
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
 * @param modalityLUT - A modality Lookup Table
 * @param voiLUT - A Volume of Interest Lookup Table
 *
 * @returns A lookup table to apply to the image
 */
export default function (
  image: IImage,
  windowWidth: number,
  windowCenter: number,
  invert: boolean,
  modalityLUT: CPUFallbackLUT,
  voiLUT: CPUFallbackLUT
): Uint8ClampedArray {
  const maxPixelValue = image.maxPixelValue;
  const minPixelValue = image.minPixelValue;
  const offset = Math.min(minPixelValue, 0);

  if (image.cachedLut === undefined) {
    const length = maxPixelValue - offset + 1;

    image.cachedLut = {};
    image.cachedLut.lutArray = new Uint8ClampedArray(length);
  }

  const lut = image.cachedLut.lutArray;

  const mlutfn = getModalityLut(image.slope, image.intercept, modalityLUT);
  const vlutfn = getVOILUT(windowWidth, windowCenter, voiLUT);

  if (image.isPreScaled) {
    // if the image is already preScaled, it means that the slop and the intercept
    // are applied and there is no need for a modalityLut
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
  } else {
    if (invert === true) {
      for (
        let storedValue = minPixelValue;
        storedValue <= maxPixelValue;
        storedValue++
      ) {
        lut[storedValue + -offset] = 255 - vlutfn(mlutfn(storedValue));
      }
    } else {
      for (
        let storedValue = minPixelValue;
        storedValue <= maxPixelValue;
        storedValue++
      ) {
        lut[storedValue + -offset] = vlutfn(mlutfn(storedValue));
      }
    }
  }

  return lut;
}
