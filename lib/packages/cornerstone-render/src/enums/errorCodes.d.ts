/**
 * Exceptions/Error Messages that the library raises.
 */
declare enum ERROR_CODES {
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
    CACHE_SIZE_EXCEEDED = "CACHE_SIZE_EXCEEDED",
    IMAGE_LOAD_ERROR = "IMAGE_LOAD_ERROR"
}
export default ERROR_CODES;
