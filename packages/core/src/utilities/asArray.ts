/**
 * Returns an array with the item if it is a object/primitive, otherwise, if it is an array, returns the array itself.
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
