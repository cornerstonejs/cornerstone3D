import RequestType from '../enums/RequestType';
import { IImage } from '../types';
import { uuidv4 } from '../utilities';

type AdditionalDetails = {
  imageId?: string;
  volumeId?: string;
};

type RequestDetailsInterface = {
  requestFn: () => Promise<IImage | void>;
  type: RequestType;
  additionalDetails: AdditionalDetails;
};

type RequestPool = {
  [name in RequestType]: { [key: number]: RequestDetailsInterface[] };
};

/**
 * RequestPool manager class is a base class that manages the request pools.
 * It is used imageRetrievalPoolManager, and imageLoadPoolManager to retrieve and load images.
 * Previously requestPoolManager was used to manage the retrieval and loading and decoding
 * of the images in a way that new requests were sent after the image was both loaded and decoded
 * which was not performant since it was waiting for the image to be loaded and decoded before
 * sending the next request which is a network request and can be done in parallel.
 * Now, we use separate imageRetrievalPoolManager and imageLoadPoolManager
 * to improve performance and both are extending the RequestPoolManager class which
 * is a basic queueing pool.
 *
 * A new requestPool can be created by instantiating a new RequestPoolManager class.
 *
 * ```javascript
 * const requestPoolManager = new RequestPoolManager()
 * ```
 *
 * ## ImageLoadPoolManager
 *
 * You can use the imageLoadPoolManager to load images, by providing a `requestFn`
 * that returns a promise for the image. You can provide a `type` to specify the type of
 * request (interaction, thumbnail, prefetch), and you can provide additional details
 * that will be passed to the requestFn. Below is an example of a requestFn that loads
 * an image from an imageId:
 *
 * ```javascript
 *
 * const priority = -5
 * const requestType = RequestType.Interaction
 * const additionalDetails = { imageId }
 * const options = {
 *   targetBuffer: {
 *     type: 'Float32Array',
 *     offset: null,
 *     length: null,
 *   },
 *   preScale: {
 *      enabled: true,
 *    },
 * }
 *
 * imageLoadPoolManager.addRequest(
 *   loadAndCacheImage(imageId, options).then(() => { // set on viewport}),
 *   requestType,
 *   additionalDetails,
 *   priority
 * )
 * ```
 * ### ImageRetrievalPoolManager
 * You don't need to directly use the imageRetrievalPoolManager to load images
 * since the imageLoadPoolManager will automatically use it for retrieval. However,
 * maximum number of concurrent requests can be set by calling `setMaxConcurrentRequests`.
 */
class RequestPoolManager {
  private id: string;
  private awake: boolean;
  private requestPool: RequestPool;
  private numRequests = {
    interaction: 0,
    thumbnail: 0,
    prefetch: 0,
    compute: 0,
  };
  /* maximum number of requests of each type. */
  public maxNumRequests: {
    interaction: number;
    thumbnail: number;
    prefetch: number;
    compute: number;
  };
  /* A public property that is used to set the delay between requests. */
  public grabDelay: number;
  private timeoutHandle: number;

  /**
   * By default a request pool containing three priority groups, one for each
   * of the request types, is created. Maximum number of requests of each type
   * is set to 6.
   */
  constructor(id?: string) {
    this.id = id ? id : uuidv4();

    this.requestPool = {
      interaction: { 0: [] },
      thumbnail: { 0: [] },
      prefetch: { 0: [] },
      compute: { 0: [] },
    };

    this.grabDelay = 5;
    this.awake = false;

    this.numRequests = {
      interaction: 0,
      thumbnail: 0,
      prefetch: 0,
      compute: 0,
    };

    this.maxNumRequests = {
      interaction: 6,
      thumbnail: 6,
      prefetch: 5,
      // I believe there is a bug right now, where if there are two workers
      // and one wants to run a compute job 6 times and the limit is just 5, then
      // the other worker will never get a chance to run its compute job.
      // we should probably have a separate limit for compute jobs per worker
      // context as there is another layer of parallelism there. For this reason
      // I'm setting the limit to 1000 for now.
      compute: 1000,
    };
  }

  /**
   * This function sets the maximum number of requests for a given request type.
   * @param type - The type of request you want to set the max number
   * of requests for it can be either of interaction, prefetch, or thumbnail.
   * @param maxNumRequests - The maximum number of requests that can be
   * made at a time.
   */
  public setMaxSimultaneousRequests(
    type: RequestType,
    maxNumRequests: number
  ): void {
    this.maxNumRequests[type] = maxNumRequests;
  }

  /**
   * It returns the maximum number of requests of a given type that can be made
   * @param type - The type of request.
   * @returns The maximum number of requests of a given type.
   */
  public getMaxSimultaneousRequests(type: RequestType): number {
    return this.maxNumRequests[type];
  }

  /**
   * Stops further fetching of the requests, all the ongoing requests will still
   * be retrieved
   */
  public destroy(): void {
    if (this.timeoutHandle) {
      window.clearTimeout(this.timeoutHandle);
    }
  }

  /**
   * Adds the requests to the pool of requests.
   *
   * @param requestFn - A function that returns a promise which resolves in the image
   * @param type - Priority category, it can be either of interaction, prefetch,
   * or thumbnail.
   * @param additionalDetails - Additional details that requests can contain.
   * For instance the volumeId for the volume requests
   * @param priority - Priority number for each category of requests. Its default
   * value is priority 0. The lower the priority number, the higher the priority number
   *
   */
  public addRequest(
    requestFn: () => Promise<IImage | void>,
    type: RequestType,
    additionalDetails: Record<string, unknown>,
    priority = 0
  ): void {
    // Describe the request
    const requestDetails: RequestDetailsInterface = {
      requestFn,
      type,
      additionalDetails,
    };

    // Check if the priority group exists on the request type
    if (this.requestPool[type][priority] === undefined) {
      this.requestPool[type][priority] = [];
    }

    // Adding the request to the correct priority group of the request type
    this.requestPool[type][priority].push(requestDetails);

    this.startGrabbing();
  }

  /**
   * Filter the requestPoolManager's pool of request based on the result of
   * provided filter function. The provided filter function needs to return false or true
   *
   * @param filterFunction - The filter function for filtering of the requests to keep
   */
  public filterRequests(
    filterFunction: (requestDetails: RequestDetailsInterface) => boolean
  ): void {
    Object.keys(this.requestPool).forEach((type: string) => {
      const requestType = this.requestPool[type];
      Object.keys(requestType).forEach((priority) => {
        requestType[priority] = requestType[priority].filter(
          (requestDetails: RequestDetailsInterface) => {
            return filterFunction(requestDetails);
          }
        );
      });
    });
  }

  /**
   * Clears the requests specific to the provided type. For instance, the
   * pool of requests of type 'interaction' can be cleared via this function.
   *
   *
   * @param type - category of the request (either interaction, prefetch or thumbnail)
   */
  public clearRequestStack(type: string): void {
    if (!this.requestPool[type]) {
      throw new Error(`No category for the type ${type} found`);
    }
    this.requestPool[type] = { 0: [] };
  }

  private sendRequests(type) {
    const requestsToSend = this.maxNumRequests[type] - this.numRequests[type];
    let syncImageCount = 0;

    for (let i = 0; i < requestsToSend; i++) {
      const requestDetails = this.getNextRequest(type);
      if (requestDetails === null) {
        return false;
      } else if (requestDetails) {
        this.numRequests[type]++;
        this.awake = true;

        let requestResult;
        try {
          requestResult = requestDetails.requestFn();
        } catch (e) {
          // This is the only warning one will get, so need a warn message
          console.warn('sendRequest failed', e);
        }
        if (requestResult?.finally) {
          requestResult.finally(() => {
            this.numRequests[type]--;
            this.startAgain();
          });
        } else {
          // Handle non-async request functions too - typically just short circuit ones
          this.numRequests[type]--;
          syncImageCount++;
        }
      }
    }
    if (syncImageCount) {
      this.startAgain();
    }

    return true;
  }

  private getNextRequest(type): RequestDetailsInterface | null {
    const interactionPriorities = this.getSortedPriorityGroups(type);
    for (const priority of interactionPriorities) {
      if (this.requestPool[type][priority].length) {
        return this.requestPool[type][priority].shift();
      }
    }

    return null;
  }

  protected startGrabbing(): void {
    const hasRemainingInteractionRequests = this.sendRequests(
      RequestType.Interaction
    );
    const hasRemainingThumbnailRequests = this.sendRequests(
      RequestType.Thumbnail
    );
    const hasRemainingPrefetchRequests = this.sendRequests(
      RequestType.Prefetch
    );
    const hasRemainingComputeRequests = this.sendRequests(RequestType.Compute);

    if (
      !hasRemainingInteractionRequests &&
      !hasRemainingThumbnailRequests &&
      !hasRemainingPrefetchRequests &&
      !hasRemainingComputeRequests
    ) {
      this.awake = false;
    }
  }

  protected startAgain(): void {
    if (!this.awake) {
      return;
    }

    if (this.grabDelay !== undefined) {
      // Prevents calling setTimeout hundreds of times when hundreds of requests
      // are added which make it slower and works in an unexpected way when
      // destroy/clearTimeout is called because only the last handle is stored.
      if (!this.timeoutHandle) {
        this.timeoutHandle = window.setTimeout(() => {
          this.timeoutHandle = null;
          this.startGrabbing();
        }, this.grabDelay);
      }
    } else {
      this.startGrabbing();
    }
  }

  protected getSortedPriorityGroups(type: string): Array<number> {
    const priorities = Object.keys(this.requestPool[type])
      .map(Number)
      .filter((priority) => this.requestPool[type][priority].length)
      .sort((a, b) => a - b);
    return priorities;
  }

  /**
   * Returns the request pool containing different categories, their priority and
   * the added request details.
   *
   * @returns the request pool which contains different categories, their priority and
   * the added request details
   */
  getRequestPool(): RequestPool {
    return this.requestPool;
  }
}

export { RequestPoolManager };
