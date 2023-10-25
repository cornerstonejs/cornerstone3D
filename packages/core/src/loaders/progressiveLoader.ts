import type {
  IRetrieveConfiguration,
  IImage,
  RetrieveStage,
  EventTypes,
  ProgressiveListener,
} from '../types';
import sequentialRetrieveConfiguration from './sequentialRetrieveConfiguration';
import interleavedRetrieveConfiguration from './interleavedRetrieveConfiguration';
import { loadAndCacheImage, loadImage } from './imageLoader';
import { triggerEvent, ProgressiveIterator, decimate } from '../utilities';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import { ImageStatus, RequestType, Events } from '../enums';
import cache from '../cache';
import eventTarget from '../eventTarget';

export { sequentialRetrieveConfiguration, interleavedRetrieveConfiguration };

type StageStatus = {
  stageId: string;
  startTime?: number;
  stageStartTime?: number;
  numberOfImages: number;
  numberOfFailures: number;
  remaining: number;
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
  retrieveOptions: IRetrieveConfiguration = interleavedRetrieveConfiguration
): Promise<unknown> {
  const displayedIterator = new ProgressiveIterator<void | IImage>('displayed');
  const imageStatus = new Map<string, ImageStatus>();
  const stageStatus = new Map<string, StageStatus>();

  function sendRequest(request, options) {
    const { imageId, next } = request;
    const errorCallback = (reason, done) => {
      // console.log('Erroring out', reason, done);
      listener.errorCallback(imageId, complete || !next, reason);
      if (done) {
        updateStageStatus(stageStatus, request.stage, reason);
      }
    };
    let loadedPromise;
    if (options.target?.arrayBuffer) {
      loadedPromise = loadAndCacheImage(imageId, options);
    } else {
      loadedPromise = loadImage(imageId, options);
    }
    const uncompressedIterator = ProgressiveIterator.as(loadedPromise);
    let complete = false;

    uncompressedIterator
      .forEach(async (image, done) => {
        const oldStatus = imageStatus[imageId];
        if (!image) {
          console.warn('No image retrieved', imageId);
          return;
        }
        const { status } = image;
        complete ||= status === ImageStatus.DONE;
        if (oldStatus !== undefined && oldStatus > status) {
          // We already have a better status, so don't update it
          updateStageStatus(stageStatus, request.stage, null, true);
          return;
        }
        imageStatus[imageId] = ImageStatus.LOADING;

        listener.successCallback(imageId, image, status);
        imageStatus[imageId] = status;
        displayedIterator.add(image);
        if (done) {
          updateStageStatus(stageStatus, request.stage);
        }
        fillNearbyFrames(listener, imageStatus, request, image, options);
      }, errorCallback)
      .finally(() => {
        if (next) {
          if (!complete) {
            if (cache.getImageLoadObject(imageId)) {
              cache.removeImageLoadObject(imageId);
            }
            addRequest(next, options.streamingData);
          } else {
            for (let skip = next; skip; skip = skip.next) {
              updateStageStatus(stageStatus, skip.stage, null, true);
            }
          }
        }
        if (stageStatus.size === 0) {
          displayedIterator.resolve();
        }
      });
    const doneLoad = uncompressedIterator.getDonePromise();
    // Errors already handled above in the callback
    return doneLoad.catch((e) => null);
  }

  /** Adds a rquest to the image load pool manager */
  function addRequest(request, streamingData = {}) {
    const { imageId, stage } = request;
    const baseOptions = listener.getTargetOptions(imageId);
    const options = {
      ...baseOptions,
      retrieveTypeId: stage.retrieveTypeId,
      streamingData,
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

  // The actual function is to just setup the interleave and add the
  // requests, with all the actual work being handled by the nested functions
  const interleaved = interleave(imageIds, retrieveOptions, stageStatus);
  for (const request of interleaved) {
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

export type NearbyRequest = {
  itemId: string;
  linearId?: string;
  status: ImageStatus;
  nearbyItem;
};

export type ProgressiveRequest = {
  imageId: string;
  stage: RetrieveStage;
  next?: ProgressiveRequest;
  nearbyRequests?: NearbyRequest[];
};

/** Interleaves the values according to the stages definition */
function interleave(
  requests: string[],
  retrieveConfiguration: IRetrieveConfiguration,
  stageStatus: Map<string, StageStatus>
) {
  const { stages } = retrieveConfiguration;
  const interleaved = new Array<ProgressiveRequest>();
  // Maps image id to the LAST progressive request - to allow tail append
  const imageRequests = new Map<string, ProgressiveRequest>();

  const addStageInstance = (stage, position) => {
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
      nearbyRequests: findNearbyRequests(index, requests, stage),
    };
    addStageStatus(stageStatus, stage);
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
    indices.forEach((index) => addStageInstance(stage, index));
  }
  return interleaved;
}

/**
 * Finds nearby requests to fulfill to show the merge information earlier.
 * @param index - to use as the base value
 * @param requests - set of image ids to request
 * @param stage - to find information from
 * @returns Array of nearby frames to fill when the main stage is done
 */
function findNearbyRequests(
  index: number,
  requests: string[],
  stage
): NearbyRequest[] {
  const nearby = new Array<NearbyRequest>();
  if (!stage.nearbyFrames) {
    return nearby;
  }
  for (const nearbyItem of stage.nearbyFrames) {
    const nearbyIndex = index + nearbyItem.offset;
    if (nearbyIndex < 0 || nearbyIndex >= requests.length) {
      continue;
    }
    nearby.push({
      itemId: requests[nearbyIndex],
      nearbyItem,
      status: nearbyItem.status,
    });
    if (nearbyItem.linearOffset !== undefined) {
      const linearIndex =
        nearbyItem.linearOffset !== undefined &&
        nearbyItem.linearOffset + nearbyItem.offset;
      if (linearIndex >= 0 && linearIndex < requests.length) {
        nearby[nearby.length - 1].linearId = requests[linearIndex];
      }
    }
  }

  return nearby;
}

/** Actually fills the nearby frames from the given frame */
function fillNearbyFrames(
  listener: ProgressiveListener,
  imageStatus: Map<string, ImageStatus>,
  request,
  image,
  options
) {
  if (!request?.nearbyRequests?.length) {
    return;
  }

  const {
    arrayBuffer,
    offset: srcOffset,
    type,
    length: frameLength,
  } = options.targetBuffer;
  if (!arrayBuffer || srcOffset === undefined || !type) {
    return;
  }
  const scalarData = new Float32Array(arrayBuffer);
  const bytesPerPixel = scalarData.byteLength / scalarData.length;
  const offset = options.targetBuffer.offset / bytesPerPixel; // in bytes
  // since set is based on the underlying type,
  // we need to divide the offset bytes by the byte type
  const src = scalarData.slice(offset, offset + frameLength);

  for (const nearbyItem of request.nearbyRequests) {
    try {
      const { itemId: targetId, status } = nearbyItem;
      const targetStatus = imageStatus.get(targetId);
      if (targetStatus !== undefined && targetStatus < status) {
        continue;
      }
      const targetOptions = listener.getTargetOptions(targetId);
      const { offset: targetOffset } = targetOptions.targetBuffer as any;
      scalarData.set(src, targetOffset / bytesPerPixel);
      const nearbyImage = {
        ...image,
        status,
      };
      listener.successCallback(targetId, nearbyImage, status);
      imageStatus[targetId] = status;
    } catch (e) {
      console.log("Couldn't fill nearby item ", nearbyItem.itemId, e);
    }
  }
}

function addStageStatus(stageStatus: Map<string, StageStatus>, stage) {
  const { id } = stage;
  const status = stageStatus.get(id) || {
    stageId: id,
    startTime: Date.now(),
    stageStartTime: null,
    numberOfImages: 0,
    numberOfFailures: 0,
    remaining: 0,
  };
  status.remaining++;
  stageStatus.set(id, status);
  return status;
}

function updateStageStatus(
  stageStatus: Map<string, StageStatus>,
  stage,
  failure?,
  skipped = false
) {
  const { id } = stage;
  const status = stageStatus.get(id);
  if (!status) {
    console.warn('Stage already completed:', id);
    return;
  }
  status.remaining--;
  if (failure) {
    status.numberOfFailures++;
  } else if (!skipped) {
    status.numberOfImages++;
  }
  if (!skipped && !status.stageStartTime) {
    status.stageStartTime = Date.now();
  }
  if (!status.remaining) {
    const {
      numberOfFailures,
      numberOfImages,
      stageStartTime = Date.now(),
      startTime,
    } = status;
    const detail: EventTypes.ImageLoadStageEventDetail = {
      stageId: id,
      numberOfFailures,
      numberOfImages,
      stageDurationInMS: stageStartTime ? Date.now() - stageStartTime : null,
      startDurationInMS: Date.now() - startTime,
    };
    triggerEvent(eventTarget, Events.IMAGE_LOAD_STAGE, detail);
    stageStatus.delete(id);
  }
}
