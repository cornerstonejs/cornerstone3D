import { CPUFallbackViewport, Point2 } from '../../../../types';

type Shift = {
  x: number;
  y: number;
};
/**
 * Corrects the shift by accounting for viewport rotation and flips.
 *
 * @param shift - The shift to correct.
 * @param viewportOrientation - Object containing information on the viewport orientation.
 */
export default function (
  shift: Shift,
  viewportOrientation: CPUFallbackViewport
): Shift {
  const { hflip, vflip, rotation } = viewportOrientation;

  // Apply Flips
  shift.x *= hflip ? -1 : 1;
  shift.y *= vflip ? -1 : 1;

  // Apply rotations
  if (rotation !== 0) {
    const angle = (rotation * Math.PI) / 180;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const newX = shift.x * cosA - shift.y * sinA;
    const newY = shift.x * sinA + shift.y * cosA;

    shift.x = newX;
    shift.y = newY;
  }

  return shift;
}
