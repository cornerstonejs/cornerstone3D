import type { PixelDataTypedArray, PixelDataTypedArrayString } from '../types';

/**
 * Gets the appropriate TypedArray constructor based on the provided buffer type.
 *
 * @param bufferType - The type of the buffer.
 * @param isVolumeBuffer - Whether the buffer is for volume rendering.
 * @returns The TypedArray constructor.
 * @throws Error if an unsupported buffer type is provided.
 */
function getConstructorFromType(
  bufferType: PixelDataTypedArrayString,
  isVolumeBuffer: boolean
): new (length: number) => PixelDataTypedArray {
  switch (bufferType) {
    case 'Float32Array':
      return Float32Array;
    case 'Uint8Array':
      return Uint8Array;
    case 'Uint16Array':
    case 'Int16Array':
      if (!isVolumeBuffer) {
        return bufferType === 'Uint16Array' ? Uint16Array : Int16Array;
      } else {
        console.debug(
          `${bufferType} is not supported for volume rendering, switching back to Float32Array`
        );
        return Float32Array;
      }
    default:
      if (bufferType) {
        throw new Error(
          'TargetBuffer should be Float32Array, Uint8Array, Uint16Array, or Int16Array'
        );
      } else {
        return Float32Array;
      }
  }
}

/**
 * Creates a target buffer configuration based on the provided options.
 *
 * @param targetBufferType - The type of the target buffer.
 * @param length - The length of the target buffer.
 * @param options - Options for the target buffer.
 * @returns An object containing the number of bytes and the TypedArray constructor for the target buffer.
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
  const TypedArrayConstructor = getConstructorFromType(
    targetBufferType,
    isVolumeBuffer
  );

  const bytesPerElement = TypedArrayConstructor.BYTES_PER_ELEMENT;
  const numBytes = length * bytesPerElement;

  return { numBytes, TypedArrayConstructor };
}

export { getBufferConfiguration, getConstructorFromType };
