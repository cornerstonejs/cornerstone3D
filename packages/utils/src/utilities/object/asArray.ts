/**
 * Returns an array with the item if it is an object/primitive, otherwise,
 * if it is an array, returns the array itself.
 *
 * @param item array or single object/primitive
 * @returns an array with the object/primitive as the single element or the original array
 */
export function asArray<T>(item: T | T[]): T[] {
  if (Array.isArray(item)) {
    return item;
  }
  return [item];
}

/**
 * The first element of an array, or the item itself when it is not an array -
 * the value `asArray(item)[0]` gives, without creating an array. Use it to read
 * a single value from an attribute that a source can deliver as a value or as a
 * one-element array.
 *
 * @param item array or single object/primitive
 * @returns `item[0]` for an array, otherwise `item`
 */
export function asArrayFirst<T>(item: T | T[]): T {
  return Array.isArray(item) ? item[0] : item;
}

export default asArray;
