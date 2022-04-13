import { IImage } from '../types';

import { loadAndCacheImage } from '../imageLoader';
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
  requestType = RequestType.Interaction,
  priority = -5
): Promise<string> {
  return new Promise((resolve, reject) => {
    function successCallback(image: IImage, imageId: string) {
      renderToCanvas(canvas, image);
      resolve(imageId);
    }

    function errorCallback(error: Error, imageId: string) {
      console.error(error, imageId);
      reject(error);
    }

    function sendRequest(imageId, imageIdIndex, options) {
      return loadAndCacheImage(imageId, options).then(
        (image) => {
          successCallback.call(this, image, imageIdIndex, imageId);
        },
        (error) => {
          errorCallback.call(this, error, imageIdIndex, imageId);
        }
      );
    }

    const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};
    const suvFactor = metaData.get('scalingModule', imageId) || {};

    const generalSeriesModule =
      metaData.get('generalSeriesModule', imageId) || {};

    const scalingParameters = {
      rescaleSlope: modalityLutModule.rescaleSlope,
      rescaleIntercept: modalityLutModule.rescaleIntercept,
      modality: generalSeriesModule.modality,
      suvbw: suvFactor.suvbw,
    };

    const options = {
      targetBuffer: {
        type: 'Float32Array',
        offset: null,
        length: null,
      },
      preScale: {
        scalingParameters,
      },
    };

    imageLoadPoolManager.addRequest(
      sendRequest.bind(null, imageId, options),
      requestType,
      { imageId },
      priority
    );
  });
}
