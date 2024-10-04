/**
 * Request types for requesting images from the imageLoadPoolManager
 */
enum RequestType {
  /** Highest priority for loading*/
  INTERACTION = 'INTERACTION',
  /** Second highest priority for loading*/
  THUMBNAIL = 'THUMBNAIL',
  /** Third highest priority for loading, usually used for image loading in the background*/
  PREFETCH = 'PREFETCH',
  /** Lower priority, often used for background computations in the worker */
  COMPUTE = 'COMPUTE',
}

export default RequestType;
