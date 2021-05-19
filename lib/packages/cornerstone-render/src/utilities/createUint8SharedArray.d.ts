/**
 * A helper function that creates a new Float32Array that utilized a shared
 * array buffer. This allows the array to be updated  simultaneously in
 * workers or the main thread. Depending on the system (the CPU, the OS, the Browser)
 * it can take a while until the change is propagated to all contexts.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer|MDN: SharedArrayBuffer}
 * @remarks
 * We use SharedArrayBuffers in our ImageCache class. It's what allows us to
 * stream data to build a volume. It's important to note that SharedArrayBuffer
 * does not work out of the box for all web browsers. In some, it is disabled
 * behind a flag; in others, it has been removed entirely.
 *
 * @example
 * Creating an array for a Volume with known dimensions:
 * ```
 * const dimensions = [512, 512, 25];
 * const scalarData = createUint8SharedArray(dimensions[0] * dimensions[1] * dimensions[2]);
 * ```
 *
 * @param length - frame size * number of frames
 * @returns a Uint8Array with an underlying SharedArrayBuffer
 * @public
 */
declare function createUint8SharedArray(length: number): Uint8Array;
export default createUint8SharedArray;
