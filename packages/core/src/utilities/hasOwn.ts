export default function hasOwn<T extends object, K extends PropertyKey>(
  object: T,
  key: K
): object is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key);
}
