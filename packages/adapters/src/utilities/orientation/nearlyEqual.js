/**
 * nearlyEqual - Returns true if a and b are nearly equal
 * within a tolerance.
 *
 * Inspiration for this function logic source comes from:
 * https://floating-point-gui.de/errors/comparison/
 *
 * https://floating-point-gui.de is published under
 * the Creative Commons Attribution License (BY):
 * http://creativecommons.org/licenses/by/3.0/
 *
 * The actual implementation has been adjusted 
 * as discussed here: https://github.com/dcmjs-org/dcmjs/pull/304
 *
 * More information on floating point comparison here:
 * http://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/
 *
 * @param {Number} a
 * @param {Number} b
 * @param {Number} tolerance.
 * @return {Boolean} True if a and b are nearly equal.
 */
export default function nearlyEqual(a, b, epsilon) {
    const absA = Math.abs(a);
    const absB = Math.abs(b);
    const diff = Math.abs(a - b);
    if (a === b) {
        // shortcut, handles infinities
        return true;
    } else if (a === 0 || b === 0 || absA + absB < epsilon * epsilon) {
        // a or b is zero or both are extremely close to it
        // relative error is less meaningful here
        return diff < epsilon;
    } else {
        // use relative error
        return diff / Math.min(absA + absB, Number.MAX_VALUE) < epsilon;
    }
}
