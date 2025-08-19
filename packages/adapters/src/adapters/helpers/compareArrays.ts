import { utilities } from "@cornerstonejs/core";

/**
 * Returns true if array1 and array2 are equal within a tolerance.
 *
 * @param array1 - First array
 * @param array2 - Second array
 * @param tolerance - Tolerance
 * @returns True if array1 and array2 are equal.
 */
export default function compareArrays(
    array1: number[],
    array2: number[],
    tolerance: number
): boolean {
    return utilities.isEqual(array1, array2, tolerance);
}
