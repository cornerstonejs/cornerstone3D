/**
 * Validates a numeric value for DICOM SR NumericValue field (VR: DS).
 * DS (Decimal String) does not support Infinity, -Infinity, or NaN.
 *
 * @param value - The numeric value to validate
 * @returns The value if valid, undefined if invalid (Infinity, -Infinity, NaN, null, or undefined)
 */
export function validateNumericValue(
  value: number | null | undefined
): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
