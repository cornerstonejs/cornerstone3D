import { RequestPoolManager } from './requestPoolManager';
import RequestType from '../enums/RequestType';

/**
 * You can use the imageLoadPoolManager to load images, by providing a `requestFn`
 * that returns a promise for the image. You can provide a `type` to specify the type of
 * request (interaction, thumbnail, prefetch), and you can provide additional details
 * that will be passed to the requestFn. Below is an example of a requestFn that loads
 * an image from an imageId:
 *
 * ```javascript
 *
 * const priority = -5
 * const requestType = RequestType.INTERACTION
 * const additionalDetails = { imageId }
 * const options = {
 *   targetBuffer: {
 *     type: 'Float32Array',
 *     offset: null,
 *     length: null,
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
 */
const imageLoadPoolManager = new RequestPoolManager('imageLoadPool');

imageLoadPoolManager.grabDelay = 0;

imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.INTERACTION, 1000);
imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.THUMBNAIL, 1000);
imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.PREFETCH, 1000);

export default imageLoadPoolManager;
