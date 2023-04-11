import getOrCreateCanvas from '../RenderingEngine/helpers/getOrCreateCanvas';
import { ViewportType, Events } from '../enums';
import StackViewport from '../RenderingEngine/StackViewport';
import { IImage } from '../types';
import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';

/**
 * Renders an imageId to a Canvas. This method will handle creation
 * of a temporary enabledElement, setting the imageId, and rendering the image via
 * a StackViewport, copying the canvas drawing to the given canvas Element, and
 * disabling the created temporary element. SuppressEvents argument is used to
 * prevent events from firing during the render process (e.g. during a series
 * of renders to a thumbnail image).
 *
 * @example
 * ```
 * const canvas = document.getElementById('myCanvas')
 * const imageId = 'myImageId'
 *
 * renderToCanvas(canvas, imageId)
 * ```
 * @param imageId - The imageId to render
 * @param canvas - Canvas element to render to
 * @param renderingEngineId - [Default=null] The rendering engine Id
 * to use, if not provided, will create a new rendering engine with a random Id (this is preferred)
 * @param suppressEvents - [Default = true] boolean to suppress events during render,
 * if undefined, events will be suppressed
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function renderToCanvas(
  canvas: HTMLCanvasElement,
  image: IImage
): Promise<string> {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('canvas element is required');
  }

  // const viewportId = `thumbnailViewport-${image.imageId}`;
  const viewportId = `thumbnailViewport-${image.imageId}`;
  const imageId = image.imageId;

  const element = document.createElement('div');
  element.id = viewportId;
  element.style.width = `${canvas.width}px`;
  element.style.height = `${canvas.height}px`;

  // Todo: we should be able to use the temporary element without appending
  // it to the DOM
  element.style.visibility = 'hidden';
  document.body.appendChild(element);

  const renderingEngine = getRenderingEngines()[0];
  const stackViewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      suppressEvents: true,
    },
  };

  renderingEngine.enableElement(stackViewportInput);
  const viewport = renderingEngine.getViewport(viewportId) as StackViewport;
  return new Promise((resolve) => {
    // Creating a temporary HTML element so that we can
    // enable it and later disable it without loosing the canvas context

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // get the canvas element that is the child of the div
      const temporaryCanvas = getOrCreateCanvas(element);

      // Copy the temporary canvas to the given canvas
      const context = canvas.getContext('2d');
      context.drawImage(temporaryCanvas, 0, 0);
      document.body.removeChild(element);
      resolve(imageId);
    });

    viewport.renderImageObject(image);
    viewport.render();
  });
}
