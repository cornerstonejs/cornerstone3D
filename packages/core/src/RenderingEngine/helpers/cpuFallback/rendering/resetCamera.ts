import getImageFitScale from './getImageFitScale';
import { CPUFallbackEnabledElement } from '../../../../types';

/**
 * Resets the camera to the default position. which would be the center of the image.
 * with no translation, no flipping, no zoom and proper scale.
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  resetPan = true,
  resetZoom = true
): void {
  const { canvas, image, viewport } = enabledElement;
  const scale = getImageFitScale(canvas, image, 0).scaleFactor;

  viewport.vflip = false;
  viewport.hflip = false;

  if (resetPan) {
    viewport.translation.x = 0;
    viewport.translation.y = 0;
  }

  if (resetZoom) {
    viewport.displayedArea.tlhc.x = 1;
    viewport.displayedArea.tlhc.y = 1;
    viewport.displayedArea.brhc.x = image.columns;
    viewport.displayedArea.brhc.y = image.rows;

    viewport.scale = scale;
  }
}
