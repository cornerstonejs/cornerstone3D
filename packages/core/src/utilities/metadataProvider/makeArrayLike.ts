export function makeArrayLike(obj) {
  Object.defineProperty(obj, 'length', {
    value: 1,
  });

  Object.defineProperty(obj, 0, {
    value: obj,
    writable: true,
    configurable: true,
    enumerable: false, // 🔒 do not iterate index either
  });

  Object.defineProperty(obj, Symbol.iterator, {
    value: function* () {
      yield this; // iterator yields only the object
    },
  });

  return obj;
}
