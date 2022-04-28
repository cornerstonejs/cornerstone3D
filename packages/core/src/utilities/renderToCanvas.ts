import { IImage, CPUFallbackEnabledElement } from '../types';

import getDefaultViewport from '../RenderingEngine/helpers/cpuFallback/rendering/getDefaultViewport';
import calculateTransform from '../RenderingEngine/helpers/cpuFallback/rendering/calculateTransform';
import drawImageSync from '../RenderingEngine/helpers/cpuFallback/drawImageSync';

/**
 * Renders a cornerstone image object to a canvas.
 * Note: this does not load the image but only takes care of the rendering pipeline
 *
 * @param image - Cornerstone image object
 * @param canvas - Canvas element to render to
 */
export default function renderToCanvas(
  canvas: HTMLCanvasElement,
  image: IImage,
  modality?: string
): void {
  const viewport = getDefaultViewport(canvas, image, modality);

  const enabledElement: CPUFallbackEnabledElement = {
    canvas,
    viewport,
    image,
    renderingTools: {},
  };

  enabledElement.transform = calculateTransform(enabledElement);

  const invalidated = true;
  drawImageSync(enabledElement, invalidated);
}
