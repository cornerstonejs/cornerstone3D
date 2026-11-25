/**
 * Deeply clones a value using structuredClone when possible, with a fallback
 * for cloneable plain objects in runtimes where structuredClone is unavailable
 * or rejects non-cloneable values such as functions.
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to the permissive clone below.
    }
  }

  return cloneValue(value, new WeakMap<object, unknown>());
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const existingClone = seen.get(value);
  if (existingClone) {
    return existingClone as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof Map) {
    const clonedMap = new Map();
    seen.set(value, clonedMap);
    value.forEach((mapValue, mapKey) => {
      clonedMap.set(cloneValue(mapKey, seen), cloneValue(mapValue, seen));
    });
    return clonedMap as T;
  }

  if (value instanceof Set) {
    const clonedSet = new Set();
    seen.set(value, clonedSet);
    value.forEach((setValue) => {
      clonedSet.add(cloneValue(setValue, seen));
    });
    return clonedSet as T;
  }

  if (Array.isArray(value)) {
    const clonedArray = [];
    seen.set(value, clonedArray);
    value.forEach((item, index) => {
      clonedArray[index] = cloneValue(item, seen);
    });
    return clonedArray as T;
  }

  const clonedObject = {} as Record<PropertyKey, unknown>;
  seen.set(value, clonedObject);

  Reflect.ownKeys(value).forEach((key) => {
    clonedObject[key] = cloneValue(value[key], seen);
  });

  return clonedObject as T;
}
