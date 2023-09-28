/**
 * checks if an object is an instance of a TypedArray
 *
 * @param obj - Object to check
 *
 * @returns True if the object is a TypedArray.
 */
export default function isTypedArray(obj: any): boolean {
  return (
    obj instanceof Int8Array ||
    obj instanceof Uint8Array ||
    obj instanceof Uint8ClampedArray ||
    obj instanceof Int16Array ||
    obj instanceof Uint16Array ||
    obj instanceof Int32Array ||
    obj instanceof Uint32Array ||
    obj instanceof Float32Array ||
    obj instanceof Float64Array
  );
}
