/**
 * Exceptions/Error Messages that the library raises.
 */
enum ERROR_CODES {
  /**
   * Error that is thrown when the ImageCache exceeds its max cache size.
   *
   * @example
   * Show where you might catch a CACHE_SIZE_EXCEEDED error code
   * ```
   * try {
   *  const imageCache = new ImageCache('...');
   *  imageCache.makeAndCacheLocalImageVolume('...');
   * } catch(ex) {
   *  console.log(ex.message); // CACHE_SIZE_EXCEEDED
   * }
   * ```
   */
  CACHE_SIZE_EXCEEDED = 'CACHE_SIZE_EXCEEDED',
}

export default ERROR_CODES
