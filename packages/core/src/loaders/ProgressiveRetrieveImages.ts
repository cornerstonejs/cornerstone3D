import {
  IRetrieveConfiguration,
  IImage,
  RetrieveStage,
  EventTypes,
  ImageLoadListener,
  RetrieveOptions,
} from '../types';
import * as metaData from '../metaData';
import singleRetrieveStages from './configuration/singleRetrieve';
import sequentialRetrieveStages from './configuration/sequentialRetrieve';
import interleavedRetrieveStages from './configuration/interleavedRetrieve';
import { loadAndCacheImage } from './imageLoader';
import { triggerEvent, ProgressiveIterator, decimate } from '../utilities';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import { ImageQualityStatus, RequestType, Events } from '../enums';
import cache from '../cache';
import eventTarget from '../eventTarget';
import { fillNearbyFrames } from './fillNearbyFrames';

export {
  sequentialRetrieveStages,
  interleavedRetrieveStages,
  singleRetrieveStages,
};

type StageStatus = {
  stageId: string;
  // startTime is the overall start of loading a given image id
  startTime?: number;
  // stageStartTime is the time to start loading this stage item
  stageStartTime?: number;
  totalImageCount: number;
  imageLoadFailedCount: number;
  imageLoadPendingCount: number;
};

/**
 * A nearby request is a request that can be fulfilled by copying another image
 */
export type NearbyRequest = {
  // The item id to fill
  itemId: string;
  linearId?: string;
  // The new status of the filled image (will only fill if the existing status
  // is less than this one)
  status: ImageQualityStatus;
};

export type ProgressiveRequest = {
  imageId: string;
  stage: RetrieveStage;
  next?: ProgressiveRequest;
  /**
   * Nearby requests are a set of requests for filling nearby images which
   * could be filled by using this image as a copied image to generate the
   * nearby data as a low-resolution alternative image.
   */
  nearbyRequests?: NearbyRequest[];
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
export class ProgressiveRetrieveImages implements IRetrieveConfiguration {
  public static interleavedRetrieveStages = {
    stages: interleavedRetrieveStages,
    constructor: ProgressiveRetrieveImages,
  };

  public static singleRetrieveStages = {
    stages: singleRetrieveStages,
    constructor: ProgressiveRetrieveImages,
  };

  public static sequentialRetrieveStages = {
    stages: sequentialRetrieveStages,
    constructor: ProgressiveRetrieveImages,
  };

  stages: RetrieveStage[];
  retrieveOptions: Record<string, RetrieveOptions>;

  constructor(imageRetrieveConfiguration) {
    this.stages = imageRetrieveConfiguration.stages;
    this.retrieveOptions = imageRetrieveConfiguration.retrieveOptions || {};
  }

  public retrieveImages(imageIds: string[], listener: ImageLoadListener) {
    return load(imageIds, listener, this);
  }
}

export async function load(
  imageIds: string[],
  listener: ImageLoadListener,
  retrieveConfiguration: ProgressiveRetrieveImages
): Promise<unknown> {
  const displayedIterator = new ProgressiveIterator<void | IImage>('displayed');
  const imageQualityStatusMap = new Map<string, ImageQualityStatus>();
  const stageStatusMap = new Map<string, StageStatus>();
  let outstandingRequests = 0;

  function sendRequest(request, options) {
    const { imageId, next } = request;
    const errorCallback = (reason, done) => {
      listener.errorCallback(imageId, complete || !next, reason);
      if (done) {
        updateStageStatus(stageStatusMap, request.stage, reason);
      }
    };
    const loadedPromise = (options.loader || loadAndCacheImage)(
      imageId,
      options
    );
    const uncompressedIterator = ProgressiveIterator.as(loadedPromise);
    let complete = false;

    uncompressedIterator
      .forEach(async (image, done) => {
        const oldStatus = imageQualityStatusMap.get(imageId);
        if (!image) {
          console.warn('No image retrieved', imageId);
          return;
        }
        const { imageQualityStatus } = image;
        complete ||= imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION;
        if (oldStatus !== undefined && oldStatus > imageQualityStatus) {
          // We already have a better status, so don't update it
          updateStageStatus(stageStatusMap, request.stage, null, true);
          return;
        }

        listener.successCallback(imageId, image);
        imageQualityStatusMap.set(imageId, imageQualityStatus);
        displayedIterator.add(image);
        if (done) {
          updateStageStatus(stageStatusMap, request.stage);
        }
        fillNearbyFrames(
          listener,
          imageQualityStatusMap,
          request,
          image,
          options
        );
      }, errorCallback)
      .finally(() => {
        if (!complete && next) {
          if (cache.getImageLoadObject(imageId)) {
            cache.removeImageLoadObject(imageId);
          }
          addRequest(next, options.streamingData);
        } else {
          outstandingRequests--;
          for (let skip = next; skip; skip = skip.next) {
            updateStageStatus(stageStatusMap, skip.stage, null, true);
          }
        }
        if (outstandingRequests <= 0) {
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
    const baseOptions = listener.getLoaderImageOptions(imageId);
    if (!baseOptions) {
      // Image no longer of interest
      return;
    }
    const { retrieveType = 'default' } = stage;
    const { retrieveOptions: keyedRetrieveOptions } = retrieveConfiguration;
    const retrieveOptions =
      keyedRetrieveOptions[retrieveType] || keyedRetrieveOptions.default;
    const options = {
      ...baseOptions,
      retrieveType,
      retrieveOptions,
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
  const interleaved = createStageRequests(
    imageIds,
    retrieveConfiguration,
    stageStatusMap
  );
  outstandingRequests = interleaved.length;
  for (const request of interleaved) {
    addRequest(request);
  }
  if (outstandingRequests === 0) {
    return Promise.resolve(null);
  }

  return displayedIterator.getDonePromise();
}

/** Interleaves the values according to the stages definition */
function createStageRequests(
  requests: string[],
  retrieveConfiguration: ProgressiveRetrieveImages,
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
 * @param imageIds - set of image ids to request
 * @param stage - to find information from
 * @returns Array of nearby frames to fill when the main stage is done
 */
function findNearbyRequests(
  index: number,
  imageIds: string[],
  stage
): NearbyRequest[] {
  const nearby = new Array<NearbyRequest>();
  if (!stage.nearbyFrames) {
    return nearby;
  }
  for (const nearbyItem of stage.nearbyFrames) {
    const nearbyIndex = index + nearbyItem.offset;
    if (nearbyIndex < 0 || nearbyIndex >= imageIds.length) {
      continue;
    }
    nearby.push({
      itemId: imageIds[nearbyIndex],
      status: nearbyItem.status,
    });
    if (nearbyItem.linearOffset !== undefined) {
      const linearIndex =
        nearbyItem.linearOffset !== undefined &&
        nearbyItem.linearOffset + nearbyItem.offset;
      if (linearIndex >= 0 && linearIndex < imageIds.length) {
        nearby[nearby.length - 1].linearId = imageIds[linearIndex];
      }
    }
  }

  return nearby;
}

function addStageStatus(stageStatus: Map<string, StageStatus>, stage) {
  const { id } = stage;
  const status = stageStatus.get(id) || {
    stageId: id,
    startTime: Date.now(),
    stageStartTime: null,
    totalImageCount: 0,
    imageLoadFailedCount: 0,
    imageLoadPendingCount: 0,
  };
  status.imageLoadPendingCount++;
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
  status.imageLoadPendingCount--;
  if (failure) {
    status.imageLoadFailedCount++;
  } else if (!skipped) {
    status.totalImageCount++;
  }
  if (!skipped && !status.stageStartTime) {
    status.stageStartTime = Date.now();
  }
  if (!status.imageLoadPendingCount) {
    const {
      imageLoadFailedCount: numberOfFailures,
      totalImageCount: numberOfImages,
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
    triggerEvent(eventTarget, Events.IMAGE_RETRIEVAL_STAGE, detail);
    stageStatus.delete(id);
  }
}

export default ProgressiveRetrieveImages;
