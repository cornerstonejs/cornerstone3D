import { IImage } from '../types';

import { loadAndCacheImage } from '../loaders/imageLoader';
import * as metaData from '../metaData';
import { RequestType } from '../enums';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import renderToCanvas from './renderToCanvas';

/**
 * Loads and renders an imageId to a Canvas. It will use the CPU rendering pipeline
 * for image.
 *
 * @example
 * ```
 * const canvas = document.getElementById('myCanvas')
 * const imageId = 'myImageId'
 *
 * loadImageToCanvas(canvas, imageId)
 * ```
 * @param imageId - The imageId to render
 * @param canvas - Canvas element to render to
 * @param requestType - The type of request (default to interaction), can be 'interaction' or 'prefetch' or 'thumbnail'
 * the order of loading for the pool manager is interaction, thumbnail, prefetch
 * @param priority - The priority of the request within the request type (lower is higher priority)
 * @returns - A promise that resolves when the image has been rendered with the imageId
 */
export default function loadImageToCanvas(
  canvas: HTMLCanvasElement,
  imageId: string,
  requestType = RequestType.Thumbnail,
  priority = -5
): Promise<string> {
  return new Promise((resolve, reject) => {
    function successCallback(image: IImage, imageId: string) {
      const { modality } = metaData.get('generalSeriesModule', imageId) || {};

      image.isPreScaled = image.isPreScaled || image.preScale?.scaled;
      renderToCanvas(canvas, image, modality);
      resolve(imageId);
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

    // IMPORTANT: Request type should be passed if not the 'interaction'
    // highest priority will be used for the request type in the imageRetrievalPool
    const options = {
      targetBuffer: {
        type: 'Float32Array',
        offset: null,
        length: null,
      },
      preScale: {
        enabled: true,
      },
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
