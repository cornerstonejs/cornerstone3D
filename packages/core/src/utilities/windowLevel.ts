/**
 * Given a low and high window level, return the window width and window center
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
  const windowWidth = Math.abs(low - high);
  const windowCenter = low + windowWidth / 2;

  return { windowWidth, windowCenter };
}

/**
 * Given a window width and center, return the lower and upper bounds of the window
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
  const lower = windowCenter - windowWidth / 2.0;
  const upper = windowCenter + windowWidth / 2.0;

  return { lower, upper };
}

export { toWindowLevel, toLowHighRange };
