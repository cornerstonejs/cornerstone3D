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
 * the value `asArray(item)[0]` gives, without creating an array.
 *
 * Use it to read one string or number value safely from data whose format is
 * not known: naturalized DICOM JSON, a metadata provider, or other plain data.
 * One source can deliver a multi-valued attribute as a single value
 * (`'SIGMOID'`) and another source as an array (`['SIGMOID']`). A check such as
 * `value?.length && value[0]` is not safe for this, because a string also has
 * a `length`: that check returns the first character (`'S'`) of a string.
 *
 * @param item array or single object/primitive
 * @returns `item[0]` for an array, otherwise `item`
 */
export function asArrayFirst<T>(item: T | T[]): T {
  return Array.isArray(item) ? item[0] : item;
}

/**
 * The values of a multi-valued attribute (VM 1-n, for example `ImageType`,
 * `CorrectedImage` or `FrameType`) as one flat list, with each string value
 * split on the DICOM value separator `\`.
 *
 * Some DICOMweb servers store a multi-valued CS attribute as ONE
 * backslash-joined string (`"DECY\\ATTN\\SCAT"`) instead of separate values.
 * dcmjs 0.x naturalized such a value as the string itself; dcmjs 1.0
 * naturalizes it as a one-item list (`["DECY\\ATTN\\SCAT"]`). Code that splits
 * only a string, or calls `includes` on the value, fails for one of the two
 * shapes. This function gives `['DECY', 'ATTN', 'SCAT']` for both shapes, and
 * for a correct list `['DECY', 'ATTN', 'SCAT']`.
 *
 * - `undefined` and `null` give `[]` (unlike `asArray`, which gives
 *   `[undefined]`).
 * - A string gives its values split on `\`; an empty string gives `['']`.
 * - A list gives its items, with each string item split on `\`.
 * - A non-string item (a number, an object) is kept unchanged.
 *
 * Do not use it on a value that can hold a literal backslash, such as a
 * value of VR LT, ST or UT.
 *
 * @param value a single value, a list of values, or `undefined`/`null`
 * @returns a new flat list of the values
 */
export function asMultiValueArray<T = string>(
  value: T | readonly T[] | null | undefined
): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  const items = Array.isArray(value) ? (value as readonly T[]) : [value as T];
  const result: T[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      result.push(...(item.split('\\') as T[]));
    } else {
      result.push(item);
    }
  }
  return result;
}

export default asArray;
