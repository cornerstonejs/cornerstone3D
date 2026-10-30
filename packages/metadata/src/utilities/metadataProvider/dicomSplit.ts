import { asMultiValueArray } from '@cornerstonejs/utils';

/**
 * Converts a value into an array by splitting on backslashes when needed.
 * Use for DICOM multi-valued attributes (e.g. value representations that are
 * backslash-separated). When a source supplies a single string with backslashes
 * instead of separate values (non-conforming to the DICOM standard), this
 * normalizes it to an array of strings to match the standard representation.
 *
 * - If `value` is a string or an array, it gives `asMultiValueArray(value)`:
 *   each string is split on '\\', so the dcmjs 1.0 one-item list
 *   `['A\\B']` also gives `['A', 'B']`.
 * - Otherwise `value` is returned as-is (`undefined` stays `undefined`).
 *
 * @param value - A string (possibly with '\\'), an array, or another value.
 * @returns An array of strings when given a string or an array, otherwise the original value.
 */
export function dicomSplit(value) {
  return Array.isArray(value) || typeof value === 'string'
    ? asMultiValueArray(value)
    : value;
}
