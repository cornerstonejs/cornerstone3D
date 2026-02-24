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
