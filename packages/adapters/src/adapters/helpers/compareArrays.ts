import { utilities } from "dcmjs";

const { nearlyEqual } = utilities.orientation;

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
    if (array1.length !== array2.length) {
        return false;
    }

    for (let i = 0; i < array1.length; ++i) {
        if (!nearlyEqual(array1[i], array2[i], tolerance)) {
            return false;
        }
    }

    return true;
}
