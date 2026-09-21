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
 * 32k is enough of an HTJ2K codestream to decode a recognisable full
 * resolution image, and OpenJPH decodes the truncated remainder rather than
 * throwing, so there is no reason to buy a larger buffer before showing
 * something.
 */
export const DEFAULT_INITIAL_CHUNK_SIZE = 32768;

/**
 * Bytes to retrieve, or to accumulate, between decodes after the first, when
 * the retrieve options set no `chunkSize`.
 *
 * Larger than the initial size because by this point the image is already on
 * screen and the job is refining it: advancing in 32k steps would mean many
 * more requests and decodes for the same result.
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
