import { getShouldUseSharedArrayBuffer } from '../init';

const SMALL_MEMORY_LIMIT = 2 * 1024 * 1024 * 1024 - 2;
const BIG_MEMORY_LIMIT = SMALL_MEMORY_LIMIT * 2;
// Wasm page size
const PAGE_SIZE = 65536;

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
 * const scalarData = createFloat32SharedArray(dimensions[0] * dimensions[1] * dimensions[2]);
 * ```
 *
 * @param length - frame size * number of frames
 * @returns a Float32Array with an underlying SharedArrayBuffer
 * @public
 */
function createFloat32SharedArray(length: number): Float32Array {
  if (!getShouldUseSharedArrayBuffer()) {
    throw new Error(
      'Your page is NOT cross-origin isolated, see https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated'
    );
  }
  if (window.SharedArrayBuffer === undefined) {
    throw new Error(
      'SharedArrayBuffer is NOT supported in your browser see https://developer.chrome.com/blog/enabling-shared-array-buffer/'
    );
  }

  const byteLength = length * 4;

  if (byteLength < SMALL_MEMORY_LIMIT) {
    const sharedArrayBuffer = new SharedArrayBuffer(byteLength);
    return new Float32Array(sharedArrayBuffer);
  } else if (byteLength < BIG_MEMORY_LIMIT) {
    const pages = Math.ceil(byteLength / PAGE_SIZE);
    const memory = new WebAssembly.Memory({
      initial: pages,
      maximum: pages,
      shared: true,
    });
    return new Float32Array(memory.buffer, 0, length);
  }
}

export default createFloat32SharedArray;
