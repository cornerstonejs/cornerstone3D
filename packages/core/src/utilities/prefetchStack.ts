import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import { loadAndCacheImage } from '../imageLoader';
import { RequestType } from '../enums';
import { metaData } from '..';

/**
 * It takes an array of imageIds, and loads the images in the background.
 * It can be used to prefetch images for faster scrolling in a stack.
 *
 * @param imageIds - An array of imageIds to prefetch.
 * @param requestType - This is the type of request. It can be one of the
 * following:
 * @param priority - The priority of the request.
 */
function prefetchStack(
  imageIds: string[],
  requestType = RequestType.Prefetch,
  priority = 0
): void {
  if (imageIds.length === 0) {
    return;
  }

  function sendRequest(imageId, imageIdIndex, options) {
    return loadAndCacheImage(imageId, options).then(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      (image) => {},
      (error) => {
        console.error(error);
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
    requestType,
  };

  imageIds.forEach((imageId, imageIdIndex) => {
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

    const additionalDetails = { imageId };
    const optionsToUse = {
      ...options,
      preScale: {
        scalingParameters,
      },
    };

    imageLoadPoolManager.addRequest(
      sendRequest.bind(null, imageId, imageIdIndex, optionsToUse),
      requestType,
      additionalDetails,
      priority
    );
  });
}

export default prefetchStack;
