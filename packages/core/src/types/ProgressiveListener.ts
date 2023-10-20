export type ProgressiveListener = {
  /** Called when an image is loaded.  May be called multiple times with increasing
   * status values.
   */
  successCallback: (imageId, imageIndex, image, status) => void;
  /** Called when an image fails to load.  A failure is permanent if no more attempts
   * will be made.
   */
  errorCallback: (imageId, permanent, reason) => void;

  /**
   * Gets the target options for loading a given image, used by the image loader.
   * @returns Target options to use when loading the image.
   * @throws exception to prevent further loading of this image
   */
  getTargetOptions?: (imageId) => Record<string, unknown>;
};
