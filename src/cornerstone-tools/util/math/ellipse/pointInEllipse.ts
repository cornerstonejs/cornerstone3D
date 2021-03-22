import {Point2} from '../../../types'

/**
 * @function pointInEllipse Returns true if the `location ` is within the ellipse.
 *
 * A point is inside the ellipse if x^2/a^2 + y^2/b^2 <= 1,
 * Where [x,y] is the coordinate and a and b are the x and y axes of the ellipse.
 *
 * @param  {Object} ellipse  Object defining the ellipse.
 * @param  {Point2} location The location of the point.
 * @returns {boolean} True if the point is within the ellipse.
 */
export default function pointInEllipse(ellipse, location: Point2) :boolean {
  const xRadius = ellipse.width / 2;
  const yRadius = ellipse.height / 2;

  if (xRadius <= 0.0 || yRadius <= 0.0) {
    return false;
  }

  const center = [ellipse.left + xRadius, ellipse.top + yRadius];
  const normalized = [location[0] - center[0], location[1] - center[1]];

  const inEllipse =
    (normalized[0] * normalized[0]) / (xRadius * xRadius) +
      (normalized[1] * normalized[1]) / (yRadius * yRadius) <=
    1.0;

  return inEllipse;
}
