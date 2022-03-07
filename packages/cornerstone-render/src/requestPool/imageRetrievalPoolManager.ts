import { RequestPoolManager } from './requestPoolManager'

/**
 * ImageRetrieval Pool Manager
 * Retrieval (usually) === XHR requests
 * @category RequestPoolManager
 *
 */
const imageRetrievalPoolManager = new RequestPoolManager()

imageRetrievalPoolManager.maxNumRequests = {
  interaction: 200,
  thumbnail: 200,
  prefetch: 200,
}
imageRetrievalPoolManager.grabDelay = 0

export default imageRetrievalPoolManager
