// Defines a useful generic fixed length array type for vectors.
// @see: https://stackoverflow.com/a/59906630/1867984
type ArrayLengthMutationKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift'
type FixedLengthArray<T, L extends number, TObj = [T, ...Array<T>]> = Pick<
  TObj,
  Exclude<keyof TObj, ArrayLengthMutationKeys>
> & {
  readonly length: L
  [I: number]: T
  [Symbol.iterator]: () => IterableIterator<T>
}

export default FixedLengthArray
