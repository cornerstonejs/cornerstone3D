/**
 * Converts a value into an array by splitting on backslashes when needed.
 * Use for DICOM multi-valued attributes (e.g. value representations that are
 * backslash-separated). When a source supplies a single string with backslashes
 * instead of separate values (non-conforming to the DICOM standard), this
 * normalizes it to an array of strings to match the standard representation.
 *
 * - If `value` is already an array, it is returned unchanged.
 * - If `value` is a string, it is split on '\\' and the resulting array is returned.
 * - Otherwise `value` is returned as-is.
 *
 * @param value - A string (possibly with '\\'), an array, or another value.
 * @returns An array of strings when given a backslash-separated string, otherwise the original value or array.
 */
export function dicomSplit(value) {
  return (
    (Array.isArray(value) && value) ||
    (typeof value === 'string' && value.split('\\')) ||
    value
  );
}
