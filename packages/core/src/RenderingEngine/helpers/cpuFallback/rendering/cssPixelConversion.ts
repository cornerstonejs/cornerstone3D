import type { Point2 } from '../../../../types';

/**
 * The CPU transform built by `calculateTransform` is anchored on the canvas
 * backing store (`enabledElement.canvas.width/height`), which
 * `getOrCreateCanvas` sizes in **device** pixels. `pixelToCanvas` and
 * `canvasToPixel` therefore speak device pixels.
 *
 * The public viewport contract speaks **CSS** pixels: the GPU viewports divide
 * by `devicePixelRatio` before returning from `worldToCanvas`, and the tools
 * event layer derives its canvas points from `getBoundingClientRect`, which is
 * CSS pixels with no DPR term. Left unconverted, the CPU path disagrees with
 * both by exactly `devicePixelRatio` - invisible at 1, and a proportional
 * error at any other value (HiDPI display, zoomed browser, mobile device).
 *
 * These helpers convert at that boundary. They deliberately are **not** folded
 * into `pixelToCanvas`/`canvasToPixel`: internal rendering callers pass device
 * pixels to those on purpose (e.g. `canvasToPixel(el, [canvas.width / 2, ...])`
 * in the planar CPU render path), and `setToPixelCoordinateSystem` applies the
 * same transform to a 2D context where device pixels are the correct unit.
 */
function getDevicePixelRatio(): number {
  return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
}

/**
 * Converts a point produced by `pixelToCanvas` (device pixels) into the CSS
 * pixels the public `worldToCanvas` contract returns.
 */
export function deviceToCssPixels(point: Point2): Point2 {
  const devicePixelRatio = getDevicePixelRatio();

  return [point[0] / devicePixelRatio, point[1] / devicePixelRatio];
}

/**
 * Converts a CSS-pixel canvas point from the public `canvasToWorld` contract
 * into the device pixels `canvasToPixel` expects.
 */
export function cssToDevicePixels(point: Point2): Point2 {
  const devicePixelRatio = getDevicePixelRatio();

  return [point[0] * devicePixelRatio, point[1] * devicePixelRatio];
}
