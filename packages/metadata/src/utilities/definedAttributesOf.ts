/**
 * Copies the attributes that have a value, and drops the rest.
 *
 * The main use is a dataset that a consumer builds from metadata modules. A
 * metadata provider answers a module as a whole, so an attribute the instance
 * does not carry is present as a key with the value `undefined`. A merge with
 * `Object.assign` or with the spread syntax copies that `undefined` over a real
 * value, and the dataset loses the attribute. Pass the module through this
 * function first, and the merge keeps the value the dataset already has.
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
