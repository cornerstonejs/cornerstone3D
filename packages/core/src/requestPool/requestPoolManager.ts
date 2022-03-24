import RequestType from '../enums/RequestType'

type AdditionalDetails = {
  imageId?: string
  volumeId?: string
}

type RequestDetailsInterface = {
  requestFn: () => Promise<void>
  type: RequestType
  additionalDetails: AdditionalDetails
}

type RequestPool = {
  [name in RequestType]: { [key: number]: RequestDetailsInterface[] }
}

// TODO: Some of this stuff shouldn't be public but it's easier right now
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
 *     scalingParameters,
 *   },
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
 *
 *
 */
class RequestPoolManager {
  private requestPool: RequestPool
  private awake: boolean
  private numRequests = {
    interaction: 0,
    thumbnail: 0,
    prefetch: 0,
  }
  /* maximum number of requests of each type. */
  public maxNumRequests: {
    interaction: number
    thumbnail: number
    prefetch: number
  }
  /* A public property that is used to set the delay between requests. */
  public grabDelay: number
  private timeoutHandle: number

  /**
   * By default a request pool containing three priority groups, one for each
   * of the request types, is created. Maximum number of requests of each type
   * is set to 6.
   */
  constructor() {
    this.requestPool = {
      interaction: { 0: [] },
      thumbnail: { 0: [] },
      prefetch: { 0: [] },
    }

    this.awake = false
    this.grabDelay = 5

    this.numRequests = {
      interaction: 0,
      thumbnail: 0,
      prefetch: 0,
    }

    this.maxNumRequests = {
      interaction: 6,
      thumbnail: 6,
      prefetch: 5,
    }
  }

  /**
   * Stops further fetching of the requests, all the ongoing requests will still
   * be retrieved
   */
  public destroy(): void {
    if (this.timeoutHandle) {
      window.clearTimeout(this.timeoutHandle)
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
    requestFn: () => Promise<void>,
    type: RequestType,
    additionalDetails: Record<string, unknown>,
    priority = 0
  ): void {
    // Describe the request
    const requestDetails: RequestDetailsInterface = {
      requestFn,
      type,
      additionalDetails,
    }

    // Check if the priority group exists on the request type
    if (this.requestPool[type][priority] === undefined) {
      this.requestPool[type][priority] = []
    }

    // Adding the request to the correct priority group of the request type
    this.requestPool[type][priority].push(requestDetails)

    // Wake up
    if (!this.awake) {
      this.awake = true
      this.startGrabbing()
    }
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
      const requestType = this.requestPool[type]
      Object.keys(requestType).forEach((priority) => {
        requestType[priority] = requestType[priority].filter(
          (requestDetails: RequestDetailsInterface) => {
            return filterFunction(requestDetails)
          }
        )
      })
    })
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
      throw new Error(`No category for the type ${type} found`)
    }
    this.requestPool[type] = { 0: [] }
  }

  protected sendRequest({ requestFn, type }: RequestDetailsInterface): void {
    // Increment the number of current requests of this type
    this.numRequests[type]++
    this.awake = true

    requestFn().finally(() => {
      this.numRequests[type]--

      this.startAgain()
    })
  }

  protected startGrabbing(): void {
    // TODO: This is the reason things aren't going as fast as expected
    // const maxSimultaneousRequests = getMaxSimultaneousRequests()
    // this.maxNumRequests = {
    //   interaction: Math.max(maxSimultaneousRequests, 1),
    //   thumbnail: Math.max(maxSimultaneousRequests - 2, 1),
    //   prefetch: Math.max(maxSimultaneousRequests - 1, 1),
    // }

    const maxRequests =
      this.maxNumRequests.interaction +
      this.maxNumRequests.thumbnail +
      this.maxNumRequests.prefetch
    const currentRequests =
      this.numRequests.interaction +
      this.numRequests.thumbnail +
      this.numRequests.prefetch

    const requestsToSend = maxRequests - currentRequests
    for (let i = 0; i < requestsToSend; i++) {
      const requestDetails = this.getNextRequest()
      if (requestDetails === false) {
        break
      } else if (requestDetails) {
        this.sendRequest(requestDetails)
      }
    }
  }

  protected startAgain(): void {
    if (!this.awake) {
      return
    }

    if (this.grabDelay !== undefined) {
      this.timeoutHandle = window.setTimeout(() => {
        this.startGrabbing()
      }, this.grabDelay)
    } else {
      this.startGrabbing()
    }
  }

  protected getSortedPriorityGroups(type: string): Array<number> {
    const priorities = Object.keys(this.requestPool[type])
      .map(Number)
      .filter((priority) => this.requestPool[type][priority].length)
      .sort()
    return priorities
  }

  protected getNextRequest(): RequestDetailsInterface | false {
    const interactionPriorities = this.getSortedPriorityGroups('interaction')
    for (const priority of interactionPriorities) {
      if (
        this.requestPool.interaction[priority].length &&
        this.numRequests.interaction < this.maxNumRequests.interaction
      ) {
        return this.requestPool.interaction[priority].shift()
      }
    }
    const thumbnailPriorities = this.getSortedPriorityGroups('thumbnail')
    for (const priority of thumbnailPriorities) {
      if (
        this.requestPool.thumbnail[priority].length &&
        this.numRequests.thumbnail < this.maxNumRequests.thumbnail
      ) {
        return this.requestPool.thumbnail[priority].shift()
      }
    }
    const prefetchPriorities = this.getSortedPriorityGroups('prefetch')
    for (const priority of prefetchPriorities) {
      if (
        this.requestPool.prefetch[priority].length &&
        this.numRequests.prefetch < this.maxNumRequests.prefetch
      ) {
        return this.requestPool.prefetch[priority].shift()
      }
    }

    if (
      !interactionPriorities.length &&
      !thumbnailPriorities.length &&
      !prefetchPriorities.length
    ) {
      this.awake = false
    }
    return false
  }

  /**
   * Returns the request pool containing different categories, their priority and
   * the added request details.
   *
   * @returns the request pool which contains different categories, their priority and
   * the added request details
   */
  getRequestPool(): RequestPool {
    return this.requestPool
  }
}

const requestPoolManager = new RequestPoolManager()

export { RequestPoolManager }
export default requestPoolManager
