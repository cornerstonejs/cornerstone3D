import getOrCreateCanvas from '../RenderingEngine/helpers/getOrCreateCanvas';
import { ViewportType, Events } from '../enums';
import StackViewport from '../RenderingEngine/StackViewport';
import { IImage } from '../types';
import { getRenderingEngine } from '../RenderingEngine/getRenderingEngine';
import RenderingEngine from '../RenderingEngine';
import isPTPrescaledWithSUV from './isPTPrescaledWithSUV';

/**
 * Renders an cornerstone image to a Canvas. This method will handle creation
 * of a temporary enabledElement, setting the imageId, and rendering the image via
 * a StackViewport, copying the canvas drawing to the given canvas Element, and
 * disabling the created temporary element. SuppressEvents argument is used to
 * prevent events from firing during the render process (e.g. during a series
 * of renders to a thumbnail image).
 *
 * @example
 * ```
 * const canvas = document.getElementById('myCanvas')
 *
 * renderToCanvasGPU(canvas, image)
 * ```
 * @param canvas - Canvas element to render to
 * @param image - The image to render
 * @param modality - [Default = undefined] The modality of the image
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function renderToCanvasGPU(
  canvas: HTMLCanvasElement,
  image: IImage,
  modality = undefined,
  renderingEngineId = '_thumbnails'
): Promise<string> {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('canvas element is required');
  }

  const imageIdToPrint = image.imageId;
  const viewportId = `renderGPUViewport-${imageIdToPrint}`;
  const imageId = image.imageId;
  const element = document.createElement('div');
  element.style.width = `${canvas.width}px`;
  element.style.height = `${canvas.height}px`;
  element.style.visibility = 'hidden';
  element.style.position = 'absolute';

  // Up-sampling the provided canvas to match the device pixel ratio
  // since we use device pixel ratio to determine the size of the canvas
  // inside the rendering engine.
  const devicePixelRatio = window.devicePixelRatio || 1;
  const originalWidth = canvas.width;
  const originalHeight = canvas.height;
  canvas.width = originalWidth * devicePixelRatio;
  canvas.height = originalHeight * devicePixelRatio;
  canvas.style.width = `${originalWidth}px`;
  canvas.style.height = `${originalHeight}px`;

  document.body.appendChild(element);

  // add id to the element so we can find it later, and fix the : which is not allowed in css
  const uniqueId = viewportId.split(':').join('-');
  element.setAttribute('viewport-id-for-remove', uniqueId);

  const renderingEngine =
    (getRenderingEngine(renderingEngineId) as RenderingEngine) ||
    new RenderingEngine(renderingEngineId);

  let viewport = renderingEngine.getViewport(viewportId) as StackViewport;

  if (!viewport) {
    const stackViewportInput = {
      viewportId,
      type: ViewportType.STACK,
      element,
      defaultOptions: {
        suppressEvents: true,
      },
    };
    renderingEngine.enableElement(stackViewportInput);
    viewport = renderingEngine.getViewport(viewportId) as StackViewport;
  }

  return new Promise((resolve) => {
    // Creating a temporary HTML element so that we can
    // enable it and later disable it without losing the canvas context
    let elementRendered = false;

    // Create a named function to handle the event
    const onImageRendered = (eventDetail) => {
      if (elementRendered) {
        return;
      }

      // get the canvas element that is the child of the div
      const temporaryCanvas = getOrCreateCanvas(element);

      // Copy the temporary canvas to the given canvas
      const context = canvas.getContext('2d');
      context.drawImage(
        temporaryCanvas,
        0,
        0,
        temporaryCanvas.width,
        temporaryCanvas.height, // source dimensions
        0,
        0,
        canvas.width,
        canvas.height // destination dimensions
      );

      elementRendered = true;

      // remove based on id
      element.removeEventListener(Events.IMAGE_RENDERED, onImageRendered);

      // Ensure pending previous resize calls are done which might have been
      // triggered by the same disableElement call. This is to avoid potential
      // grab of the wrong canvas coordinate from the offscreen renderer since
      // disable might have not finished resizing yet and it will cause weird
      // copy to on screen from an incorrect location in the offscreen renderer.
      setTimeout(() => {
        renderingEngine.disableElement(viewportId);

        // remove all the elements that has the same id
        const elements = document.querySelectorAll(
          `[viewport-id-for-remove="${uniqueId}"]`
        );
        elements.forEach((element) => {
          element.remove();
        });
      }, 0);
      resolve(imageId);
    };

    element.addEventListener(Events.IMAGE_RENDERED, onImageRendered);
    viewport.renderImageObject(image);

    // force a reset camera to center the image
    viewport.resetCamera();

    if (modality === 'PT' && !isPTPrescaledWithSUV(image)) {
      viewport.setProperties({
        voiRange: {
          lower: image.minPixelValue,
          upper: image.maxPixelValue,
        },
      });
    }

    viewport.render();
  });
}
