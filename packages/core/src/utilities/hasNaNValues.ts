/**
 * A function that checks if there is a value in the array that is NaN.
 * or if the input is a number it just checks if it is NaN.
 * @param input - The input to check if it is NaN.
 * @returns - True if the input is NaN, false otherwise.
 */
export default function hasNaNValues(input: number[] | number): boolean {
  if (Array.isArray(input)) {
    return input.some((value) => Number.isNaN(value));
  }
  return Number.isNaN(input);
}
