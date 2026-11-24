/**
 * Formats a number with at most `maxDecimals` digits after the decimal point.
 * Trailing zeros are removed, and so is a decimal point with no digits after
 * it: 400 gives `400`, 40.5 gives `40.5`, 401.12345 gives `401.123`. A value
 * that rounds to zero gives `0`, never `-0`.
 *
 * @param value - The number to format.
 * @param maxDecimals - The maximum number of digits after the decimal point.
 */
export function formatDecimal(value: number, maxDecimals = 3): string {
  const text = value.toFixed(maxDecimals);
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  return trimmed === '-0' ? '0' : trimmed;
}

export default formatDecimal;
