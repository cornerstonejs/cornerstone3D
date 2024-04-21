import type { IImage, ViewportInputOptions } from '../types';

import { loadAndCacheImage } from '../loaders/imageLoader';
import * as metaData from '../metaData';
import { RequestType } from '../enums';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import renderToCanvasGPU from './renderToCanvasGPU';
import renderToCanvasCPU from './renderToCanvasCPU';
import { getConfiguration } from '../init';

export interface LoadImageOptions {
  canvas: HTMLCanvasElement;
  imageId: string;
  requestType?: RequestType;
  priority?: number;
  renderingEngineId?: string;
  useCPURendering?: boolean;
  // Render a thumbnail in a 256x256 viewport
  // Also set imageAspect to render thumbnail in an aspect ratio width viewport
  thumbnail?: boolean;
  // Sets the CSS width to the image aspect ratio
  imageAspect?: boolean;
  // Sets the canvas pixel size to the physical pixel size of the image area
  physicalPixels?: boolean;
  // Sets the viewport input options  Defaults to scale to fit 110%
  viewportOptions?: ViewportInputOptions;
}

/**
 * Loads and renders an imageId to a Canvas. It will use the GPU rendering pipeline
 * for image by default but you can force the CPU rendering pipeline by setting the
 * useCPURendering parameter to true.
 *
 * @example
 * ```
 * const canvas = document.getElementById('myCanvas')
 * const imageId = 'myImageId'
 *
 * loadImageToCanvas(canvas, imageId)
 * ```
 * @param canvas - Canvas element to render to
 * @param imageId - The imageId to render
 * @param requestType - The type of request (default to interaction), can be 'interaction' or 'prefetch' or 'thumbnail'
 * the order of loading for the pool manager is interaction, thumbnail, prefetch
 * @param priority - The priority of the request within the request type (lower is higher priority)
 * @param useCPURendering - Force the use of the CPU rendering pipeline (default to false)
 * @param thumbnail - Render a thumbnail image
 * @param imageAspect - assign the width based on the aspect ratio of the image
 * @param physicalPixels - set the width/height to the physical pixel size
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function loadImageToCanvas(
  options: LoadImageOptions
): Promise<string> {
  const {
    canvas,
    imageId,
    requestType = RequestType.Thumbnail,
    priority = -5,
    renderingEngineId = '_thumbnails',
    useCPURendering = false,
    thumbnail = false,
    imageAspect = false,
    physicalPixels = false,
    viewportOptions,
  } = options;

  const devicePixelRatio = window.devicePixelRatio || 1;
  const renderFn = useCPURendering ? renderToCanvasCPU : renderToCanvasGPU;

  return new Promise((resolve, reject) => {
    function successCallback(image: IImage, imageId: string) {
      const { modality } = metaData.get('generalSeriesModule', imageId) || {};

      image.isPreScaled = image.isPreScaled || image.preScale?.scaled;

      if (thumbnail) {
        canvas.height = 256;
        canvas.width = 256;
      }
      if (physicalPixels) {
        canvas.width = canvas.offsetWidth * devicePixelRatio;
        canvas.height = canvas.offsetHeight * devicePixelRatio;
      }
      if (imageAspect) {
        canvas.width = (canvas.height * image.width) / image.height;
      }

      renderFn(
        canvas,
        image,
        modality,
        renderingEngineId,
        viewportOptions
      ).then(() => {
        resolve(imageId);
      });
    }

    function errorCallback(error: Error, imageId: string) {
      console.error(error, imageId);
      reject(error);
    }

    function sendRequest(imageId, imageIdIndex, options) {
      return loadAndCacheImage(imageId, options).then(
        (image) => {
          successCallback.call(this, image, imageId);
        },
        (error) => {
          errorCallback.call(this, error, imageId);
        }
      );
    }

    const { useNorm16Texture, preferSizeOverAccuracy } =
      getConfiguration().rendering;
    const useNativeDataType = useNorm16Texture || preferSizeOverAccuracy;

    // IMPORTANT: Request type should be passed if not the 'interaction'
    // highest priority will be used for the request type in the imageRetrievalPool
    const options = {
      targetBuffer: {
        type: useNativeDataType ? undefined : 'Float32Array',
      },
      preScale: {
        enabled: true,
      },
      useNativeDataType,
      useRGBA: !!useCPURendering,
      requestType,
    };

    imageLoadPoolManager.addRequest(
      sendRequest.bind(null, imageId, null, options),
      requestType,
      { imageId },
      priority
    );
  });
}
