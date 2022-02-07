import calculateTransform from './calculateTransform';
import { CPUFallbackEnabledElement } from '../../../../types';

/**
 * Sets the canvas context transformation matrix to the pixel coordinate system.  This allows
 * geometry to be driven using the canvas context using coordinates in the pixel coordinate system
 * @param {EnabledElement} enabledElement The
 * @param {CanvasRenderingContext2D} context The CanvasRenderingContext2D for the enabledElement's Canvas
 * @param {Number} [scale] Optional scale to apply
 * @returns {void}
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  context: CanvasRenderingContext2D,
  scale?: number
): void {
  if (enabledElement === undefined) {
    throw new Error(
      'setToPixelCoordinateSystem: parameter enabledElement must not be undefined'
    );
  }
  if (context === undefined) {
    throw new Error(
      'setToPixelCoordinateSystem: parameter context must not be undefined'
    );
  }

  const transform = calculateTransform(enabledElement, scale);
  const m = transform.getMatrix();

  context.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}
