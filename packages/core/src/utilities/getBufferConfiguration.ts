import type { PixelDataTypedArray, PixelDataTypedArrayString } from '../types';

/**
 * Creates a target buffer based on the provided options.
 *
 * @param targetBufferType - The type of the target buffer.
 * @param length - The length of the target buffer.
 * @param options - Options for the target buffer. Currently supports
 * @returns Returns an object containing the number of bytes and the type array
 * constructor of the target buffer, which you then use to create the target buffer
 * with new TypedArrayConstructor(length).
 */
function getBufferConfiguration(
  targetBufferType: PixelDataTypedArrayString,
  length: number,
  options: { isVolumeBuffer?: boolean } = {}
): {
  numBytes: number;
  TypedArrayConstructor: new (length: number) => PixelDataTypedArray;
} {
  const { isVolumeBuffer = false } = options;

  switch (targetBufferType) {
    case 'Float32Array':
      return { numBytes: length * 4, TypedArrayConstructor: Float32Array };
    case 'Uint8Array':
      return { numBytes: length, TypedArrayConstructor: Uint8Array };
    case 'Uint16Array':
      if (!isVolumeBuffer) {
        return { numBytes: length * 2, TypedArrayConstructor: Uint16Array };
      } else {
        console.warn(
          'Uint16Array is not supported for volume rendering, switching back to Float32Array'
        );
        return { numBytes: length * 4, TypedArrayConstructor: Float32Array };
      }
    case 'Int16Array':
      if (!isVolumeBuffer) {
        return { numBytes: length * 2, TypedArrayConstructor: Int16Array };
      } else {
        console.warn(
          'Int16Array is not supported for volume rendering, switching back to Float32Array'
        );
        return { numBytes: length * 4, TypedArrayConstructor: Float32Array };
      }
    default:
      if (targetBufferType) {
        throw new Error(
          'TargetBuffer should be Float32Array, Uint8Array, Uint16Array, or Int16Array'
        );
      } else {
        // Use Float32Array if no targetBuffer is provided
        return { numBytes: length * 4, TypedArrayConstructor: Float32Array };
      }
  }
}

export { getBufferConfiguration };
