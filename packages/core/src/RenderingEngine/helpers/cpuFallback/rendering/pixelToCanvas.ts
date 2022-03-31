import getTransform from './getTransform';
import { CPUFallbackEnabledElement, Point2 } from '../../../../types';

/**
 * Converts a point in the pixel coordinate system to the canvas coordinate system
 * system.  This can be used to render using canvas context without having the weird
 * side effects that come from scaling and non square pixels
 *
 * @param {HTMLDivElement} element An HTML Element enabled for Cornerstone
 * @param {{x: Number, y: Number}} pt The transformed point in the pixel coordinate system
 *
 * @returns {{x: Number, y: Number}} The input point in the canvas coordinate system
 * @memberof PixelCoordinateSystem
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  pt: Point2
): Point2 {
  const transform = getTransform(enabledElement);

  return transform.transformPoint(pt);
}
