import type { IRetrieveConfiguration, IImage, RetrieveStage } from '../types';
import sequentialRetrieveConfiguration from './sequentialRetrieveConfiguration';
import interleavedRetrieveConfiguration from './interleavedRetrieveConfiguration';
import { loadAndCacheImage } from './imageLoader';
import { ProgressiveIterator, decimate } from '../utilities';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import { FrameStatus, RequestType } from '../enums';
import cache from '../cache';

export { sequentialRetrieveConfiguration, interleavedRetrieveConfiguration };

export type ProgressiveListener = {
  /** Called when an image is loaded.  May be called multiple times with increasing
   * status values.
   */
  successCallback: (imageId, imageIndex, image, status) => void;
  /** Called when an image fails to load.  A failure is permanent if no more attempts
   * will be made.
   */
  errorCallback: (imageId, permanent, reason) => void;

  /**
   * Gets the target options for loading a given image, used by the image loader.
   * @returns Target options to use when loading the image.
   * @throws exception to prevent further loading of this image
   */
  getTargetOptions?: (imageId) => Record<string, unknown>;
};

/**
 * A progressive loader is given some number of images to load,
 * and calls a success or failure callback some number of times in some
 * ordering, possibly calling back multiple times.
 * This allows the progressive loader to be configured for different setups
 * and to return render results for various images.
 *
 * When used by the a stack viewport, the progressive loader can return multiple
 * representations to the viewport, replacing earlier/more lossy versions with better ones.
 *
 * When used by a streaming loader, the progressive loader can change the ordering
 * of the rendering to retrieve high priority images first, and the lower priority
 * images later to provide a complete final rendering.
 *
 * Requests are held in a queue, such that subsequent requests for a given
 * image can be cancelled or ensured to be not initiated until the higher
 * priority image sets have been completed.
 *
 * This loader is also used for the base streamimg image volume, configured with
 * a minimal interleaved load order, combined with filling nearby volume slices
 * on load, resulting in much faster initial apparent display.
 *
 * The loader will load images from existing cached images, cached volumes, and
 * from other nearby images or one or more calls to back end services.
 *
 * @param imageIds - the set of images to load.  For a volume, these should be
 *                   ordered from top to bottom.
 * @param listener - has success and failure callbacks to listen for image deliver events, and may
 *                   have a getTargetOptions to get information on the retrieve
 * @param retrieveOptions - is a set of retrieve options to use
 */
export async function load(
  imageIds: string[],
  listener: ProgressiveListener,
  retrieveOptions: IRetrieveConfiguration
): Promise<any> {
  console.log('imageIds:', imageIds, listener, retrieveOptions);
  const displayedIterator = new ProgressiveIterator<void | IImage>('displayed');
  const frameStatus = new Map<string, FrameStatus>();

  function sendRequest(request, options) {
    const { imageId, next } = request;
    console.log('Sending request', options.retrieveTypeId);
    const loadedPromise = loadAndCacheImage(imageId, options);
    const uncompressedIterator = ProgressiveIterator.as(loadedPromise);
    let complete = false;
    const errorCallback = (reason) => {
      console.log('Erroring out');
      listener.errorCallback(imageId, complete || !next, reason);
    };
    uncompressedIterator
      .forEach(async (image) => {
        const oldStatus = frameStatus[imageId];
        const { complete: itemComplete } = image;
        const status = itemComplete ? FrameStatus.DONE : FrameStatus.LOSSY;
        complete ||= itemComplete;
        if (oldStatus !== undefined && oldStatus > status) {
          console.log('Skipping success delivery  because already delivered');
          return;
        }
        frameStatus[imageId] = FrameStatus.LOADING;

        listener.successCallback(
          imageId,
          image,
          status,
          request.stage?.stageId
        );
        frameStatus[imageId] = status;
        displayedIterator.add(image);
      }, errorCallback)
      .finally(() => {
        if (next && !complete) {
          console.log('Adding next request', next.stage.id, imageId);
          if (cache.getImageLoadObject(imageId)) {
            cache.removeImageLoadObject(imageId);
          }
          addRequest(next);
        }
      });
    return uncompressedIterator.getDonePromise();
  }

  function addRequest(request) {
    const { imageId, stage } = request;
    const baseOptions = listener.getTargetOptions(imageId);
    const options = {
      ...baseOptions,
      retrieveTypeId: stage.retrieveTypeId,
    };
    const priority = stage.priority ?? -5;
    const requestType = stage.requestType || RequestType.Interaction;
    const additionalDetails = { imageId };

    imageLoadPoolManager.addRequest(
      sendRequest.bind(this, request, options),
      requestType,
      additionalDetails,
      priority
    );
  }

  const interleaved = interleave(imageIds, retrieveOptions);
  for (const request of interleaved) {
    console.log('Adding initial request', request.stage.id, request.imageId);
    addRequest(request);
  }

  return displayedIterator.getDonePromise();
}

/** Loads a single image, using the sequential retrieve configuration */
export function loadSingle(
  imageId: string,
  listener: ProgressiveListener,
  retrieveConfiguration = sequentialRetrieveConfiguration
) {
  return load([imageId], listener, retrieveConfiguration);
}

export type ProgressiveRequest = {
  imageId: string;
  stage: RetrieveStage;
  next?: ProgressiveRequest;
};

/** Interleaves the values according to the stages definition */
function interleave(
  requests: string[],
  retrieveConfiguration: IRetrieveConfiguration
) {
  const { stages } = retrieveConfiguration;
  const interleaved = new Array<ProgressiveRequest>();
  // Maps image id to the LAST progressive request - to allow tail append
  const imageRequests = new Map<string, ProgressiveRequest>();

  const addValue = (stage, position) => {
    const index =
      position < 0
        ? requests.length + position
        : position < 1
        ? Math.floor((requests.length - 1) * position)
        : position;
    const imageId = requests[index];
    if (!imageId) {
      throw new Error(`No value found to add to requests at ${position}`);
    }
    const request: ProgressiveRequest = {
      imageId,
      stage,
    };
    const existingRequest = imageRequests.get(imageId);
    if (existingRequest) {
      existingRequest.next = request;
    } else {
      interleaved.push(request);
    }
    imageRequests.set(imageId, request);
  };

  for (const stage of stages) {
    const indices =
      stage.positions ||
      decimate(requests, stage.decimate || 1, stage.offset ?? 0);
    indices.forEach((index) => addValue(stage, index));
  }
  return interleaved;
}
