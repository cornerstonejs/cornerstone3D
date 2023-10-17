import { IRetrieveConfiguration } from '../types';

export type ProgressiveListener = {
  /** Called when an image is loaded.  May be called multiple times with increasing
   * status values.
   */
  successCallback: (imageId, imageIndex, image, status) => void;
  /** Called when an image fails to load.  A failure is permanent if no more attempts
   * will be made.
   */
  failureCallback: (imageId, imageIndex, permanent, reason) => void;
  /**
   * Gets the target options for loading a given image, used by the image loader.
   * @param imageId
   * @param imageIndex
   * @returns Target options to use when loading the image.
   * @throws exception to prevent further loading of this image
   */
  getTargetOptions?: (imageId, imageIndex) => Record<string, unknown>;
  /**
   * Called when the load is complete.
   */
  loadComplete?: () => void;
};

/**
 * A progressive loader is given some number of images to load,
 * and calls a success or failure callback some number of times in some
 * ordering, possibly calling back multiple times.
 * This allows the progressive loader to be configured for different setups
 * and to return render results for various images.
 *
 * When used by the a stack viewport, the progressive loader can return multiple
 * representations to the viewport, replacing earlier/more lossy versions with better ones.
 *
 * When used by a streaming loader, the progressive loader can change the ordering
 * of the rendering to retrieve high priority images first, and the lower priority
 * images later to provide a complete final rendering.
 *
 * Requests are held in a queue, such that subsequent requests for a given
 * image can be cancelled or ensured to be not initiated until the higher
 * priority image sets have been completed.
 *
 * This loader is also used for the base streamimg image volume, configured with
 * a minimal interleaved load order, combined with filling nearby volume slices
 * on load, resulting in much faster initial apparent display.
 *
 * The loader will load images from existing cached images, cached volumes, and
 * from other nearby images or one or more calls to back end services.
 *
 * @param imageIds - the set of images to load.  For a volume, these should be
 *                   ordered from top to bottom.
 * @param listener - has success and failure callbacks to listen for image deliver events, and may
 *                   have a getTargetOptions to get information on the retrieve
 * @param retrieveOptions - is a set of retrieve options to use
 */
export default function progressiveLoader(
  imageIds: string[],
  listener: ProgressiveListener,
  retrieveOptions: IRetrieveConfiguration
) {
  console.log('imageIds:', imageIds, listener, retrieveOptions);
}
