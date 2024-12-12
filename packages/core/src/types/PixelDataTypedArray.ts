export type PixelDataTypedArray =
  | Float32Array
  | Int16Array
  | Uint16Array
  | Uint8Array
  | Int8Array
  | Uint8ClampedArray;

export type PixelDataTypedArrayString =
  | 'Float32Array'
  | 'Int16Array'
  | 'Uint16Array'
  | 'Uint8Array'
  | 'Int8Array'
  | 'Uint8ClampedArray'
  // Used to not create an array object
  | 'none';
