/**
 * Copies the attributes that have a value, and drops the rest.
 *
 * A metadata provider answers a module as a whole, so an attribute the instance
 * does not carry arrives as a key whose value is `undefined`. Merging that key
 * clears a real value on the destination, so this drops it instead.
 *
 * @param source - the object to copy. A `null` or `undefined` source gives `{}`.
 * @returns a new object that holds only the attributes with a defined value
 *
 * @example
 * ```ts
 * const dataset = {
 *   ...newInstanceData,
 *   ...definedAttributesOf(metaData.get(MetadataModules.SERIES_DATA, imageId)),
 * };
 * ```
 */
export function definedAttributesOf<T extends object>(
  source: T | null | undefined
): Partial<T> {
  const result: Partial<T> = {};

  if (!source) {
    return result;
  }

  for (const key of Object.keys(source) as (keyof T)[]) {
    const value = source[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

export default definedAttributesOf;
