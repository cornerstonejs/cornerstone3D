import getImageFitScale from './getImageFitScale';
import { CPUFallbackEnabledElement } from '../../../../types';

/**
 * Adjusts an image's scale and translation so the image is centered and all pixels
 * in the image are viewable.
 *
 * @param element - The Cornerstone element to update
 */
export default function (enabledElement: CPUFallbackEnabledElement): void {
  const { image } = enabledElement;

  // The new scale is the minimum of the horizontal and vertical scale values
  enabledElement.viewport.scale = getImageFitScale(
    enabledElement.canvas,
    image,
    enabledElement.viewport.rotation
  ).scaleFactor;

  enabledElement.viewport.translation.x = 0;
  enabledElement.viewport.translation.y = 0;
}
