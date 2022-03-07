import { RequestPoolManager } from './requestPoolManager'

/**
 * ImageLoad Pool Manager
 * @category RequestPoolManager
 *
 */
const imageLoadPoolManager = new RequestPoolManager()

imageLoadPoolManager.maxNumRequests = {
  interaction: 1000,
  thumbnail: 1000,
  prefetch: 1000,
}
imageLoadPoolManager.grabDelay = 0

export default imageLoadPoolManager
