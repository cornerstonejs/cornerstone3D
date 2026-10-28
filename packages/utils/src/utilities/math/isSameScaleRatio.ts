/** The size of an image, in pixels. */
export interface ImageSize {
  rows: number;
  columns: number;
}

/**
 * Returns true when one scale maps the smaller size onto the larger size,
 * with each side of the smaller size off by less than one pixel. A reduced
 * resolution decode rounds each side by floor, ceil or round on its own, so
 * 513 x 2049 at half size can decode to 257 x 1025. When one side is equal,
 * the scale is 1, so 512 x 512 does not match 512 x 511 or 512 x 513.
 *
 * @param imageFrame - The size of the image, such as a decoded frame
 * @param rows - The rows of the other size, such as a target buffer
 * @param columns - The columns of the other size
 * @returns True if both sizes follow one scale
 */
export function isSameScaleRatio(
  imageFrame: ImageSize,
  rows: number,
  columns: number
): boolean {
  if (rows === imageFrame.rows || columns === imageFrame.columns) {
    return rows === imageFrame.rows && columns === imageFrame.columns;
  }
  const target = { rows, columns };
  const [small, large] =
    imageFrame.rows <= rows ? [imageFrame, target] : [target, imageFrame];
  const minScale = Math.max(
    large.rows / (small.rows + 1),
    large.columns / (small.columns + 1)
  );
  // A side of 1 gives x / 0 = Infinity, which leaves no upper bound.
  const maxScale = Math.min(
    large.rows / Math.max(small.rows - 1, 0),
    large.columns / Math.max(small.columns - 1, 0)
  );
  return minScale < maxScale;
}

export default isSameScaleRatio;
