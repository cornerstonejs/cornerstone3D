import getTransform from './getTransform';

import { Point2, CPUFallbackEnabledElement } from '../../../../types';

/**
 * Converts a point in the canvas coordinate system to the pixel coordinate system
 * system.  This can be used to reset tools' image coordinates after modifications
 * have been made in canvas space (e.g. moving a tool by a few cm, independent of
 * image resolution).
 *
 * @param element - The Cornerstone element within which the input point lies
 * @param pt - The input point in the canvas coordinate system
 *
 * @returns The transformed point in the pixel coordinate system
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  pt: Point2
): Point2 {
  const transform = getTransform(enabledElement);

  transform.invert();

  return transform.transformPoint(pt);
}
