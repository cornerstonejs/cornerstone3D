/**
 * Deeply clones an object using structuredClone if available, otherwise falls back to a custom implementation.
 *
 * @param obj - The object to be cloned.
 * @returns A deep clone of the input object.
 */
export function deepClone(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (typeof obj === 'function') {
    return obj; // Return function reference as-is
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch (error) {
      console.debug(
        'structuredClone failed, falling back to custom implementation'
      );
    }
  }

  if (Array.isArray(obj)) {
    return obj.map(deepClone);
  } else {
    const clonedObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}
