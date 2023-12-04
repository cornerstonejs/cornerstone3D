import {
  IRetrieveConfiguration,
  IImagesLoader,
  IImage,
  RetrieveStage,
  EventTypes,
  ImageLoadListener,
  RetrieveOptions,
} from '../types';
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
  imageQualityStatus: ImageQualityStatus;
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
export class ProgressiveRetrieveImages
  implements IImagesLoader, IRetrieveConfiguration
{
  public static createProgressive = createProgressive;

  public static interleavedRetrieveStages = {
    stages: interleavedRetrieveStages,
  };

  public static singleRetrieveStages = {
    stages: singleRetrieveStages,
  };

  public static sequentialRetrieveStages = {
    stages: sequentialRetrieveStages,
  };

  stages: RetrieveStage[];
  retrieveOptions: Record<string, RetrieveOptions>;

  constructor(imageRetrieveConfiguration: IRetrieveConfiguration) {
    this.stages = imageRetrieveConfiguration.stages || singleRetrieveStages;
    this.retrieveOptions = imageRetrieveConfiguration.retrieveOptions || {};
  }

  public loadImages(imageIds: string[], listener: ImageLoadListener) {
    const instance = new ProgressiveRetrieveImagesInstance(
      this,
      imageIds,
      listener
    );
    return instance.loadImages();
  }
}

class ProgressiveRetrieveImagesInstance {
  imageIds: string[];
  listener: ImageLoadListener;
  stages: RetrieveStage[];
  retrieveOptions: Record<string, RetrieveOptions>;
  outstandingRequests = 0;

  stageStatusMap = new Map<string, StageStatus>();
  imageQualityStatusMap = new Map<string, ImageQualityStatus>();
  displayedIterator = new ProgressiveIterator<void | IImage>('displayed');

  constructor(configuration: IRetrieveConfiguration, imageIds, listener) {
    this.stages = configuration.stages;
    this.retrieveOptions = configuration.retrieveOptions;
    this.imageIds = imageIds;
    this.listener = listener;
  }

  public async loadImages() {
    // The actual function is to just setup the interleave and add the
    // requests, with all the actual work being handled by the nested functions
    const interleaved = this.createStageRequests();
    this.outstandingRequests = interleaved.length;
    for (const request of interleaved) {
      this.addRequest(request);
    }
    if (this.outstandingRequests === 0) {
      return Promise.resolve(null);
    }

    return this.displayedIterator.getDonePromise();
  }

  protected sendRequest(request, options) {
    const { imageId, next } = request;
    const errorCallback = (reason, done) => {
      this.listener.errorCallback(imageId, complete || !next, reason);
      if (done) {
        this.updateStageStatus(request.stage, reason);
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
        const oldStatus = this.imageQualityStatusMap.get(imageId);
        if (!image) {
          console.warn('No image retrieved', imageId);
          return;
        }
        const { imageQualityStatus } = image;
        complete ||= imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION;
        if (oldStatus !== undefined && oldStatus > imageQualityStatus) {
          // We already have a better status, so don't update it
          this.updateStageStatus(request.stage, null, true);
          return;
        }

        this.listener.successCallback(imageId, image);
        this.imageQualityStatusMap.set(imageId, imageQualityStatus);
        this.displayedIterator.add(image);
        if (done) {
          this.updateStageStatus(request.stage);
        }
        fillNearbyFrames(
          this.listener,
          this.imageQualityStatusMap,
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
          this.addRequest(next, options.streamingData);
        } else {
          if (!complete) {
            this.listener.errorCallback(imageId, true, "Couldn't decode");
          }
          this.outstandingRequests--;
          for (let skip = next; skip; skip = skip.next) {
            this.updateStageStatus(skip.stage, null, true);
          }
        }
        if (this.outstandingRequests <= 0) {
          this.displayedIterator.resolve();
        }
      });
    const doneLoad = uncompressedIterator.getDonePromise();
    // Errors already handled above in the callback
    return doneLoad.catch((e) => null);
  }

  /** Adds a rquest to the image load pool manager */
  protected addRequest(request, streamingData = {}) {
    const { imageId, stage } = request;
    const baseOptions = this.listener.getLoaderImageOptions(imageId);
    if (!baseOptions) {
      // Image no longer of interest
      return;
    }
    const { retrieveType = 'default' } = stage;
    const { retrieveOptions: keyedRetrieveOptions } = this;
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
      this.sendRequest.bind(this, request, options),
      requestType,
      additionalDetails,
      priority
    );
  }

  protected updateStageStatus(stage, failure?, skipped = false) {
    const { id } = stage;
    const stageStatus = this.stageStatusMap.get(id);
    if (!stageStatus) {
      return;
    }
    stageStatus.imageLoadPendingCount--;
    if (failure) {
      stageStatus.imageLoadFailedCount++;
    } else if (!skipped) {
      stageStatus.totalImageCount++;
    }
    if (!skipped && !stageStatus.stageStartTime) {
      stageStatus.stageStartTime = Date.now();
    }
    if (!stageStatus.imageLoadPendingCount) {
      const {
        imageLoadFailedCount: numberOfFailures,
        totalImageCount: numberOfImages,
        stageStartTime = Date.now(),
        startTime,
      } = stageStatus;
      const detail: EventTypes.ImageLoadStageEventDetail = {
        stageId: id,
        numberOfFailures,
        numberOfImages,
        stageDurationInMS: stageStartTime ? Date.now() - stageStartTime : null,
        startDurationInMS: Date.now() - startTime,
      };
      triggerEvent(eventTarget, Events.IMAGE_RETRIEVAL_STAGE, detail);
      this.stageStatusMap.delete(id);
    }
  }

  /** Interleaves the values according to the stages definition */
  protected createStageRequests() {
    const interleaved = new Array<ProgressiveRequest>();
    // Maps image id to the LAST progressive request - to allow tail append
    const imageRequests = new Map<string, ProgressiveRequest>();

    const addStageInstance = (stage, position) => {
      const index =
        position < 0
          ? this.imageIds.length + position
          : position < 1
          ? Math.floor((this.imageIds.length - 1) * position)
          : position;
      const imageId = this.imageIds[index];
      if (!imageId) {
        throw new Error(`No value found to add to requests at ${position}`);
      }
      const request: ProgressiveRequest = {
        imageId,
        stage,
        nearbyRequests: this.findNearbyRequests(index, stage),
      };
      this.addStageStatus(stage);
      const existingRequest = imageRequests.get(imageId);
      if (existingRequest) {
        existingRequest.next = request;
      } else {
        interleaved.push(request);
      }
      imageRequests.set(imageId, request);
    };

    for (const stage of this.stages) {
      const indices =
        stage.positions ||
        decimate(this.imageIds, stage.decimate || 1, stage.offset ?? 0);
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
  protected findNearbyRequests(index: number, stage): NearbyRequest[] {
    const nearby = new Array<NearbyRequest>();
    if (!stage.nearbyFrames) {
      return nearby;
    }
    for (const nearbyItem of stage.nearbyFrames) {
      const nearbyIndex = index + nearbyItem.offset;
      if (nearbyIndex < 0 || nearbyIndex >= this.imageIds.length) {
        continue;
      }
      nearby.push({
        itemId: this.imageIds[nearbyIndex],
        imageQualityStatus: nearbyItem.imageQualityStatus,
      });
    }

    return nearby;
  }

  protected addStageStatus(stage) {
    const { id } = stage;
    const stageStatus = this.stageStatusMap.get(id) || {
      stageId: id,
      startTime: Date.now(),
      stageStartTime: null,
      totalImageCount: 0,
      imageLoadFailedCount: 0,
      imageLoadPendingCount: 0,
    };
    stageStatus.imageLoadPendingCount++;
    this.stageStatusMap.set(id, stageStatus);
    return stageStatus;
  }
}

export function createProgressive(configuration: IRetrieveConfiguration) {
  return new ProgressiveRetrieveImages(configuration);
}

export default ProgressiveRetrieveImages;
