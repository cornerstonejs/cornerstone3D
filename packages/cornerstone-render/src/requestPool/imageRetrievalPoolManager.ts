import { RequestPoolManager } from './requestPoolManager'

// Retrieval (usually) === XHR requests
const imageRetrievalPoolManager = new RequestPoolManager()

imageRetrievalPoolManager.maxNumRequests = {
  interaction: 200,
  thumbnail: 200,
  prefetch: 200,
}
imageRetrievalPoolManager.grabDelay = 0

export default imageRetrievalPoolManager
