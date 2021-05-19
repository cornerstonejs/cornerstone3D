/**
 * Small stripped down loader from cornerstoneWADOImageLoader
 * Which doesn't create cornerstone images that we don't need
 *
 * @private
 */
declare function sharedArrayBufferImageLoader(imageId: string, options?: Record<string, any>): {
    promise: Promise<Record<string, any>>;
    cancelFn: () => void;
};
/**
 * Helper method to extract the transfer-syntax from the response of the server.
 *
 * @param contentType The value of the content-type header as returned by a WADO-RS server.
 */
declare function getTransferSyntaxForContentType(contentType: string): string;
export default sharedArrayBufferImageLoader;
export { getTransferSyntaxForContentType };
