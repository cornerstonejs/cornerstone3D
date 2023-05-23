import { PixelDataTypedArray } from '../types';

export default function getPixelDataTypeFromMinMax(
  min: number,
  max: number
): PixelDataTypedArray {
  let pixelDataType;

  if (Number.isInteger(min) && Number.isInteger(max)) {
    if (min >= 0) {
      if (max <= 255) {
        pixelDataType = Uint8Array;
      } else if (max <= 65535) {
        pixelDataType = Uint16Array;
      }
    } else {
      if (min >= -128 && max <= 127) {
        pixelDataType = Int8Array;
      } else if (min >= -32768 && max <= 32767) {
        pixelDataType = Int16Array;
      }
    }
  } else {
    pixelDataType = Float32Array;
  }

  return pixelDataType;
}
