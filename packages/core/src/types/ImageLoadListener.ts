export type ImageLoadListener = {
  /**
   * Called when an image is loaded.  May be called multiple times with increasing
   * status values.
   */
  successCallback: (imageId, image) => void;
  /**
   * Called when an image fails to load.  A failure is permanent if no more attempts
   * will be made.
   */
  errorCallback: (imageId, permanent, reason) => void;

  /**
   * Gets the target options for loading a given image, used by the image loader.
   * @returns Loader image options to use when loading the image.  Note this
   *          is often a DICOMLoaderImageOptions, but doesn't have to be.
   * @throws exception to prevent further loading of this image
   */
  getLoaderImageOptions?: (imageId) => Record<string, unknown>;
};
