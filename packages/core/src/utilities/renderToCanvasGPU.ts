import getOrCreateCanvas, {
  EPSILON,
} from '../RenderingEngine/helpers/getOrCreateCanvas';
import { ViewportType, Events } from '../enums';
import {
  IImage,
  IStackViewport,
  IVolume,
  ViewportInputOptions,
  IVolumeViewport,
  ViewReference,
} from '../types';
import { getRenderingEngine } from '../RenderingEngine/getRenderingEngine';
import RenderingEngine from '../RenderingEngine';
import isPTPrescaledWithSUV from './isPTPrescaledWithSUV';
import { CanvasLoadPosition } from './loadImageToCanvas';

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
 * @param imageOrVolume - The image to render
 * @param modality - [Default = undefined] The modality of the image
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function renderToCanvasGPU(
  canvas: HTMLCanvasElement,
  imageOrVolume: IImage | IVolume,
  modality = undefined,
  renderingEngineId = '_thumbnails',
  viewportOptions: ViewportInputOptions & { viewReference?: ViewReference } = {
    displayArea: { imageArea: [1, 1] },
  }
): Promise<CanvasLoadPosition> {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('canvas element is required');
  }

  const isVolume = !(imageOrVolume as IImage).imageId;
  const image = !isVolume && (imageOrVolume as IImage);
  const volume = isVolume && (imageOrVolume as IVolume);
  const imageIdToPrint = image?.imageId || volume?.volumeId;
  const viewportId = `renderGPUViewport-${imageIdToPrint}`;
  const element = document.createElement('div');
  const devicePixelRatio = window.devicePixelRatio || 1;
  if (!viewportOptions.displayArea) {
    viewportOptions.displayArea = { imageArea: [1, 1] };
  }
  const originalWidth = canvas.width;
  const originalHeight = canvas.height;
  // The canvas width/height are set by flooring the CSS size converted
  // into physical pixels, but because these are float values, the conversion
  // isn't exact, and using the exact value sometimes leads to an off by 1
  // in the actual size, so adding EPSILON to the size resolves
  // the problem.
  // Don't touch the canvas size here as what we get out is a canvas at the right size
  element.style.width = `${originalWidth / devicePixelRatio + EPSILON}px`;
  element.style.height = `${originalHeight / devicePixelRatio + EPSILON}px`;
  element.style.visibility = 'hidden';
  element.style.position = 'absolute';

  document.body.appendChild(element);

  // add id to the element so we can find it later, and fix the : which is not allowed in css
  const uniqueId = viewportId.split(':').join('-');
  element.setAttribute('viewport-id-for-remove', uniqueId);

  // get the canvas element that is the child of the div
  const temporaryCanvas = getOrCreateCanvas(element);
  const renderingEngine =
    (getRenderingEngine(renderingEngineId) as RenderingEngine) ||
    new RenderingEngine(renderingEngineId);

  let viewport = renderingEngine.getViewport(viewportId);

  if (!viewport) {
    const viewportInput = {
      viewportId,
      type: isVolume ? ViewportType.ORTHOGRAPHIC : ViewportType.STACK,
      element,
      defaultOptions: {
        ...viewportOptions,
        suppressEvents: true,
      },
    };
    renderingEngine.enableElement(viewportInput);
    viewport = renderingEngine.getViewport(viewportId);
  }

  return new Promise((resolve) => {
    // Creating a temporary HTML element so that we can
    // enable it and later disable it without losing the canvas context
    let elementRendered = false;

    let { viewReference } = viewportOptions;

    // Create a named function to handle the event
    const onImageRendered = (eventDetail) => {
      if (elementRendered) {
        return;
      }
      if (viewReference) {
        const useViewRef = viewReference;
        viewReference = null;
        viewport.setViewReference(useViewRef);
        viewport.render();
        return;
      }

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

      const origin = viewport.canvasToWorld([0, 0]);
      const topRight = viewport.canvasToWorld([
        temporaryCanvas.width / devicePixelRatio,
        0,
      ]);
      const bottomLeft = viewport.canvasToWorld([
        0,
        temporaryCanvas.height / devicePixelRatio,
      ]);
      const thicknessMm = 1;
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
      resolve({
        origin,
        bottomLeft,
        topRight,
        thicknessMm,
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, onImageRendered);
    if (isVolume) {
      (viewport as IVolumeViewport).setVolumes([volume], false, true);
    } else {
      (viewport as IStackViewport).renderImageObject(imageOrVolume);
    }

    // force a reset camera to center the image and undo the small scaling
    viewport.resetCamera();

    if (modality === 'PT' && !isPTPrescaledWithSUV(image)) {
      (viewport as IStackViewport).setProperties({
        voiRange: {
          lower: image.minPixelValue,
          upper: image.maxPixelValue,
        },
      });
    }

    viewport.render();
  });
}
