import { vec3 } from 'gl-matrix';

import getOrCreateCanvas, {
  EPSILON,
} from '../RenderingEngine/helpers/getOrCreateCanvas';
import { ViewportType, Events } from '../enums';
import type {
  IImage,
  IVolume,
  ViewportInputOptions,
  ViewReference,
  Point3,
} from '../types';
import { getRenderingEngine } from '../RenderingEngine/getRenderingEngine';
import type RenderingEngine from '../RenderingEngine/RenderingEngine';
import TiledRenderingEngine from '../RenderingEngine/TiledRenderingEngine';
import type PlanarViewport from '../RenderingEngine/GenericViewport/Planar/PlanarViewport';
import genericViewportDisplaySetMetadataProvider from './genericViewportDisplaySetMetadataProvider';
import isPTPrescaledWithSUV from './isPTPrescaledWithSUV';
import type { CanvasLoadPosition } from './loadImageToCanvas';

/**
 * Renders an cornerstone image to a Canvas. This method will handle creation
 * of a temporary enabledElement, setting the imageId, and rendering the image via
 * a planar viewport, copying the canvas drawing to the given canvas Element, and
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
 * @returns - A promise that resolves when the image has been rendered with the imageId containing
 *     origin for the bottom/left hand corner in world coordinates of the 0,0 canvas position
 *     rightVector for a position difference of [1,0] of canvas indices as world coordinates
 *     downVector for a position difference of [0,1] of canvas indices as world coordinates
 *
 * That is, for canvas indices `[x,y]` the coordinates in world space is `origin + x*rightVector + y*downVector`
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
  const imageIdToPrint = image.imageId || volume.volumeId;
  const viewportId = `renderGPUViewport-${imageIdToPrint}`;
  const volumeDisplaySetId = `${viewportId}:volume`;
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
    new TiledRenderingEngine(renderingEngineId);

  let viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    const viewportInput = {
      viewportId,
      type: ViewportType.PLANAR,
      element,
      defaultOptions: {
        ...viewportOptions,
        suppressEvents: true,
      },
    };
    renderingEngine.enableElement(viewportInput);
    viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
  }

  return new Promise((resolve) => {
    // Creating a temporary HTML element so that we can
    // enable it and later disable it without losing the canvas context
    let elementRendered = false;

    const { viewReference } = viewportOptions;

    // Create a named function to handle the event
    const onImageRendered = (eventDetail) => {
      if (elementRendered) {
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
      const rightVector = vec3.sub(
        [0, 0, 0],
        viewport.canvasToWorld([1 / devicePixelRatio, 0]),
        origin
      ) as Point3;
      const downVector = vec3.sub(
        [0, 0, 0],
        viewport.canvasToWorld([0, 1 / devicePixelRatio]),
        origin
      ) as Point3;
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
        genericViewportDisplaySetMetadataProvider.remove(volumeDisplaySetId);

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
        rightVector,
        downVector,
      });
    };

    const shown = isVolume
      ? showVolume(viewport, volume, volumeDisplaySetId)
      : viewport.renderImageObject(image);

    shown.then(() => {
      viewport.resetViewState();
      viewport.setDisplayArea(viewportOptions.displayArea);

      if (viewReference) {
        viewport.setViewReference(viewReference);
      }

      if (modality === 'PT' && !isPTPrescaledWithSUV(image)) {
        viewport.setDisplaySetPresentation({
          voiRange: {
            lower: image.minPixelValue,
            upper: image.maxPixelValue,
          },
        });
      }

      element.addEventListener(Events.IMAGE_RENDERED, onImageRendered);
      viewport.render();
    });
  });
}

/**
 * Shows a volume of the cache on a planar viewport, in the orientation of the
 * viewport options, at the middle image of the volume when that orientation
 * is the acquisition plane. The volume is registered as the display set
 * `displaySetId`.
 *
 * @param viewport - The planar viewport
 * @param volume - The volume to show
 * @param displaySetId - The id to register the volume under
 * @returns The promise of `setDisplaySets`
 */
function showVolume(
  viewport: PlanarViewport,
  volume: IVolume,
  displaySetId: string
): Promise<void> {
  genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: volume.imageIds,
    initialImageIdIndex: Math.floor(volume.imageIds.length / 2),
    volumeId: volume.volumeId,
  });

  return viewport.setDisplaySets({ displaySetId });
}
