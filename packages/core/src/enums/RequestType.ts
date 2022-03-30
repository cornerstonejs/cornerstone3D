/**
 * Request types for requesting images from the imageLoadPoolManager
 */
enum RequestType {
  /** Highest priority for loading*/
  Interaction = 'interaction',
  /** Second highest priority for loading*/
  Thumbnail = 'thumbnail',
  /** Lowest priority for loading*/
  Prefetch = 'prefetch',
}

export default RequestType;
