/**
 * Clips a value to an upper and lower bound.
 *
 * @param val The value to clip.
 * @param low The lower bound.
 * @param high The upper bound.
 * @returns The clipped value.
 */
export function clip(val: number, low: number, high: number): number {
  return Math.min(Math.max(low, val), high);
}

/**
 * Clips a value within a box.
 * @param point The point to clip
 * @param box The bounding box to clip to.
 * @returns The clipped point.
 */
export function clipToBox(
  point: { x: number; y: number },
  box: { width: number; height: number }
): void {
  // Clip an {x, y} point to a box of size {width, height}
  point.x = clip(point.x, 0, box.width);
  point.y = clip(point.y, 0, box.height);
}

export default clip;
