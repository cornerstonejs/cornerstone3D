/**
 * Request types for requesting images from the imageLoadPoolManager
 */
enum RequestType {
  /** Highest priority for loading as this is needed before rendering images */
  Metadata = 'metadata',
  /** Highest priority for loading once metadata has been fetched */
  Interaction = 'interaction',
  /** Second highest priority for loading of images */
  Thumbnail = 'thumbnail',
  /** Third highest priority for loading, usually used for image loading in the background*/
  Prefetch = 'prefetch',
  /** Lower priority, often used for background computations in the worker */
  Compute = 'compute',
}

export default RequestType;
