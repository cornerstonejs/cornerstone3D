/**
 * Returns true if a point is within an ellipse
 * @export @public @method
 * @name pointInEllipse
 *
 * @param  {Object} ellipse  Object defining the ellipse.
 * @param  {Object} location The location of the point.
 * @returns {boolean} True if the point is within the ellipse.
 */
export default function(ellipse, location) {
  const xRadius = ellipse.width / 2;
  const yRadius = ellipse.height / 2;

  if (xRadius <= 0.0 || yRadius <= 0.0) {
    return false;
  }

  const center = [ellipse.left + xRadius, ellipse.top + yRadius];

  /* This is a more general form of the circle equation
   *
   * X^2/a^2 + Y^2/b^2 <= 1
   */

  const normalized = [location[0] - center[0], location[1] - center[1]];

  const inEllipse =
    (normalized[0] * normalized[0]) / (xRadius * xRadius) +
      (normalized[1] * normalized[1]) / (yRadius * yRadius) <=
    1.0;

  return inEllipse;
}
