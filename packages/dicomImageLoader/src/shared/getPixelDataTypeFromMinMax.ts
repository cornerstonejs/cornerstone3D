import type { Types } from '@cornerstonejs/core';

/**
 * Determines the appropriate TypedArray constructor based on the min and max pixel values
 * @param min - The minimum pixel value in the data
 * @param max - The maximum pixel value in the data
 * @returns The appropriate TypedArray constructor (Uint8Array, Uint16Array, Int8Array, Int16Array, or Float32Array)
 * @remarks
 * This function examines the min/max values and returns the most memory efficient
 * TypedArray that can represent the data without loss of precision:
 * - For integer values:
 *   - If all values are positive (min >= 0):
 *     - Returns Uint8Array if max <= 255
 *     - Returns Uint16Array if max <= 65535
 *     - Returns Uint32Array if max <= 4294967295
 *   - If values include negatives:
 *     - Returns Int8Array if values are within [-128, 127]
 *     - Returns Int16Array if values are within [-32768, 32767]
 * - For non-integer values or values outside above ranges:
 *   - Returns Float32Array as the fallback
 */
export default function getPixelDataTypeFromMinMax(
  min: number,
  max: number
): Types.PixelDataTypedArray {
  let pixelDataType;
  if (Number.isInteger(min) && Number.isInteger(max)) {
    if (min >= 0) {
      if (max <= 255) {
        pixelDataType = Uint8Array;
      } else if (max <= 65535) {
        pixelDataType = Uint16Array;
      } else if (max <= 4294967295) {
        pixelDataType = Uint32Array;
      }
    } else {
      if (min >= -128 && max <= 127) {
        pixelDataType = Int8Array;
      } else if (min >= -32768 && max <= 32767) {
        pixelDataType = Int16Array;
      }
    }
  }

  return pixelDataType || Float32Array;
}

/**
 * Validates if a given TypedArray type is appropriate for the min/max pixel value range
 * @param min - The minimum pixel value in the data
 * @param max - The maximum pixel value in the data
 * @param type - The TypedArray constructor to validate
 * @returns True if the type can represent the min/max range without data loss, false otherwise
 */
export function validatePixelDataType(
  min,
  max,
  type: Types.PixelDataTypedArray
) {
  const pixelDataType = getPixelDataTypeFromMinMax(min, max);
  return pixelDataType === type;
}
