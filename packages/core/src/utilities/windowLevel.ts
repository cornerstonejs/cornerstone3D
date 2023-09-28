/**
 * Given a low and high window level, return the window width and window center
 * Formulas from note 4 in
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.2.1
 * extended to allow for low/high swapping
 * @param low - The low window level.
 * @param high - The high window level.
 * @returns a JavaScript object with two properties: windowWidth and windowCenter.
 */
function toWindowLevel(
  low: number,
  high: number
): {
  windowWidth: number;
  windowCenter: number;
} {
  // Allow for swapping high/low
  const windowWidth = Math.abs(high - low) + 1;
  const windowCenter = (low + high + 1) / 2;

  return { windowWidth, windowCenter };
}

/**
 * Given a window width and center, return the lower and upper bounds of the window
 * The formulas for the calculation are specified in
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.2.1
 * if (x <= c - 0.5 - (w-1) /2), then y = ymin
 * else if (x > c - 0.5 + (w-1) /2), then y = ymax
 * else y = ((x - (c - 0.5)) / (w-1) + 0.5) * (ymax- ymin) + ymin
 * @param windowWidth - the width of the window in HU
 * @param windowCenter - The center of the window.
 * @returns a JavaScript object with two properties: lower and upper.
 */
function toLowHighRange(
  windowWidth: number,
  windowCenter: number
): {
  lower: number;
  upper: number;
} {
  const lower = windowCenter - 0.5 - (windowWidth - 1) / 2;
  const upper = windowCenter - 0.5 + (windowWidth - 1) / 2;

  return { lower, upper };
}

export { toWindowLevel, toLowHighRange };
