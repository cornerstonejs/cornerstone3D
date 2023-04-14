export default function getTypedArrayFromMinMax(min, max) {
  let TypedArray;

  if (Number.isInteger(min) && Number.isInteger(max)) {
    if (min >= 0) {
      if (max <= 255) {
        TypedArray = Uint8Array;
      } else if (max <= 65535) {
        TypedArray = Uint16Array;
      }
    } else {
      if (min >= -128 && max <= 127) {
        TypedArray = Int8Array;
      } else if (min >= -32768 && max <= 32767) {
        TypedArray = Int16Array;
      }
    }
  } else {
    TypedArray = Float32Array;
  }

  return TypedArray;
}
