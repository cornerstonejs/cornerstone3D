/**
 * Exceptions/Error Messages that the library raises.
 */
enum ERROR_CODES {
  /**
   * Error that is thrown when the ImageCache exceeds its max cache size.
   * This can happen for both volumes and stack images.
   */
  CACHE_SIZE_EXCEEDED = 'CACHE_SIZE_EXCEEDED',
  /**
   * Happens if an image (either a single image in stack viewport) or a slice
   * of a volume fails to load by the image/volume loaders.
   */
  IMAGE_LOAD_ERROR = 'IMAGE_LOAD_ERROR',
}

export default ERROR_CODES
