function areNumbersEqualWithTolerance(
  num1: number,
  num2: number,
  tolerance: number
): boolean {
  return Math.abs(num1 - num2) <= tolerance;
}

function areArraysEqual(
  arr1: number[] | Float32Array | Float64Array,
  arr2: number[] | Float32Array | Float64Array,
  tolerance = 1e-5
): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0; i < arr1.length; i++) {
    if (!areNumbersEqualWithTolerance(arr1[i], arr2[i], tolerance)) {
      return false;
    }
  }

  return true;
}

function isNumberType(value: any): value is number {
  return typeof value === 'number';
}

function isFloatArrayLike(
  value: any
): value is number[] | Float32Array | Float64Array {
  const isArrayLike = typeof value === 'object' || 'length' in value;
  const floatTypedArrayLike =
    value instanceof Float32Array || value instanceof Float64Array;

  return isArrayLike || floatTypedArrayLike;
}

/**
 * Returns whether two values are equal or not based on epsilon comparison.
 * For array comparison, it does NOT strictly compare them but only compare its values.
 * Typed Array comparison is valid for Float32Array and Float16Array only.
 *
 * @param v1 - The first value to compare
 * @param v2 - The second value to compare
 * @param tolerance - The acceptable tolerance, the default is 0.00001
 *
 * @returns True if the two values are within the tolerance levels.
 */
export default function isEqual<ValueType>(
  v1: ValueType,
  v2: ValueType,
  tolerance = 1e-5
): boolean {
  // values must be the same type
  if (typeof v1 !== typeof v2) {
    return false;
  }

  if (isNumberType(v1) && isNumberType(v2)) {
    return areNumbersEqualWithTolerance(v1, v2, tolerance);
  }

  // if not a number comparison fallback to array comparison
  if (isFloatArrayLike(v1) && isFloatArrayLike(v2)) {
    return areArraysEqual(v1, v2, tolerance);
  }

  return false;
}
