import { RequestPoolManager } from './requestPoolManager';
import RequestType from '../enums/RequestType';

/**
 * ImageRetrievalPoolManager
 * You don't need to directly use the imageRetrievalPoolManager to load images
 * since the imageLoadPoolManager will automatically use it for retrieval. However,
 * maximum number of concurrent requests can be set by calling `setMaxConcurrentRequests`.
 *
 * Retrieval (usually) === XHR requests
 */
const imageRetrievalPoolManager = new RequestPoolManager('imageRetrievalPool');

imageRetrievalPoolManager.setMaxSimultaneousRequests(
  RequestType.Interaction,
  200
);
imageRetrievalPoolManager.setMaxSimultaneousRequests(
  RequestType.Thumbnail,
  200
);
imageRetrievalPoolManager.setMaxSimultaneousRequests(RequestType.Prefetch, 200);
imageRetrievalPoolManager.grabDelay = 0;

export default imageRetrievalPoolManager;
