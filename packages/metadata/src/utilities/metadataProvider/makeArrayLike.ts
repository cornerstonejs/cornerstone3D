/**
 * Converts an object into an array-like object.
 * This is used to convert a single object into an array-like object with length 1
 * so that it can be iterated over or otherwise extended.  The array like
 * properties are hidden so it doesn't show up in JSON.stringify or other serializations.
 *
 * This is used to allow VM=1 attributes to be stored in the NATURAL cache as a single object but
 * still accessed as an array-like object for backwards compatibility.
 *
 * Note this does not work well on arrays or String objects.
 *
 * @param obj - The object to convert.
 * @returns The array-like object.
 */
export function makeArrayLike(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  Object.defineProperty(obj, 'length', {
    value: 1,
    configurable: true,
  });

  Object.defineProperty(obj, 0, {
    value: obj,
    writable: true,
    configurable: true,
    enumerable: false, // do not iterate index either
  });

  Object.defineProperty(obj, Symbol.iterator, {
    value: function* () {
      yield this; // iterator yields only the object
    },
    configurable: true,
  });

  return obj;
}
