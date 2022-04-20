import { RequestPoolManager } from './requestPoolManager';

/**
 * ImageRetrievalPoolManager
 * You don't need to directly use the imageRetrievalPoolManager to load images
 * since the imageLoadPoolManager will automatically use it for retrieval. However,
 * maximum number of concurrent requests can be set by calling `setMaxConcurrentRequests`.
 *
 * Retrieval (usually) === XHR requests
 */
const imageRetrievalPoolManager = new RequestPoolManager('imageRetrievalPool');

imageRetrievalPoolManager.maxNumRequests = {
  interaction: 200,
  thumbnail: 200,
  prefetch: 200,
};
imageRetrievalPoolManager.grabDelay = 0;

export default imageRetrievalPoolManager;
