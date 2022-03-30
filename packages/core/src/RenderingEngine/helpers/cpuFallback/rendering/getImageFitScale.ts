import { validateParameterUndefinedOrNull } from './validator';
import getImageSize from './getImageSize';
import { IImage } from '../../../../types';

/**
 * Calculates the horizontal, vertical and minimum scale factor for an image
   @param canvas - The window size where the image is displayed. This can be any HTML element or structure with a width, height fields (e.g. canvas).
 * @param image - The cornerstone image object
 * @param rotation - The rotation angle of the image.
 * @returns The calculated horizontal, vertical and minimum scale factor
 */
export default function (
  canvas: HTMLCanvasElement,
  image: IImage,
  rotation: number | null = null
): {
  verticalScale: number;
  horizontalScale: number;
  scaleFactor: number;
} {
  validateParameterUndefinedOrNull(
    canvas,
    'getImageScale: parameter canvas must not be undefined'
  );
  validateParameterUndefinedOrNull(
    image,
    'getImageScale: parameter image must not be undefined'
  );

  const imageSize = getImageSize(image, rotation);
  const rowPixelSpacing = image.rowPixelSpacing || 1;
  const columnPixelSpacing = image.columnPixelSpacing || 1;
  let verticalRatio = 1;
  let horizontalRatio = 1;

  if (rowPixelSpacing < columnPixelSpacing) {
    horizontalRatio = columnPixelSpacing / rowPixelSpacing;
  } else {
    // even if they are equal we want to calculate this ratio (the ration might be 0.5)
    verticalRatio = rowPixelSpacing / columnPixelSpacing;
  }

  const verticalScale = canvas.height / imageSize.height / verticalRatio;
  const horizontalScale = canvas.width / imageSize.width / horizontalRatio;

  // Fit image to window
  return {
    verticalScale,
    horizontalScale,
    scaleFactor: Math.min(horizontalScale, verticalScale),
  };
}
