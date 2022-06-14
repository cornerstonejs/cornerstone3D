import now from './rendering/now';
import { renderColorImage } from './rendering/renderColorImage';
import { renderGrayscaleImage } from './rendering/renderGrayscaleImage';
import { renderPseudoColorImage } from './rendering/renderPseudoColorImage';
import { CPUFallbackEnabledElement } from '../../../types';

/**
 * Draw an image to a given enabled element synchronously
 *
 * @param enabledElement - An enabled element to draw into
 * @param invalidated - true if pixel data has been invalidated and cached rendering should not be used
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  invalidated: boolean
): void {
  const image = enabledElement.image;

  // Check if enabledElement can be redrawn
  if (!enabledElement.canvas || !enabledElement.image) {
    return;
  }

  // Start measuring the time needed to draw the image.
  const start = now();

  image.stats = {
    lastGetPixelDataTime: -1.0,
    lastStoredPixelDataToCanvasImageDataTime: -1.0,
    lastPutImageDataTime: -1.0,
    lastRenderTime: -1.0,
    lastLutGenerateTime: -1.0,
  };

  if (image) {
    let render = image.render;

    if (!render) {
      if (enabledElement.viewport.colormap) {
        render = renderPseudoColorImage;
      } else if (image.color) {
        render = renderColorImage;
      } else {
        render = renderGrayscaleImage;
      }
    }

    render(enabledElement, invalidated);
  }

  // Calculate how long it took to draw the image/layers
  const renderTimeInMs = now() - start;

  image.stats.lastRenderTime = renderTimeInMs;

  enabledElement.invalid = false;
  enabledElement.needsRedraw = false;
}
