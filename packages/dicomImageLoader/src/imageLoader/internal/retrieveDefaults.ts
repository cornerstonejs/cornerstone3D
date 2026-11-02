/**
 * Defaults shared by the byte range and the streaming retrieve paths.
 *
 * The two paths configure the same three things and have to agree on them, so
 * they read one copy of each value rather than declaring their own.
 */

/**
 * Bytes to retrieve, or to accumulate, before the first decode of a partial
 * image, when the retrieve options set no `initialChunkSize`.
 *
 * 32k decodes: OpenJPH reads the truncated remainder rather than throwing, and
 * the result is a recognisable image. The size is still too small for a high
 * resolution frame, where 32k of codestream spreads over so many pixels that
 * the first image adds little over a blank viewport, and the decode is then
 * repeated almost immediately. 128k buys a first image worth showing and stays
 * a small part of a frame that runs to several megabytes.
 *
 * This value equals `DEFAULT_CHUNK_SIZE` at present. The two stay separate
 * because they answer different questions - time to first image against cost
 * of refinement - and either can be set on its own in the retrieve options.
 */
export const DEFAULT_INITIAL_CHUNK_SIZE = 131072;

/**
 * Bytes to retrieve, or to accumulate, between decodes after the first, when
 * the retrieve options set no `chunkSize`.
 *
 * By this point the image is already on screen and the job is refining it, so
 * advancing in smaller steps would mean many more requests and decodes for the
 * same result.
 */
export const DEFAULT_CHUNK_SIZE = 131072;

/**
 * Minimum milliseconds between two decodes of the same partial image, when the
 * retrieve options set no `msBetweenDecode`.
 *
 * Chunk size bounds how often new data arrives, but on a fast connection that
 * still outruns what a display can use: decoding is much more expensive than
 * receiving, so without a clock the decoder runs continuously and the extra
 * frames are never seen. 500ms is a readable refresh rate.
 */
export const DEFAULT_MS_BETWEEN_DECODE = 500;
