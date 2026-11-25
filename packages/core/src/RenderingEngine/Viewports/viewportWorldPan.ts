import type { Point2, Point3 } from '../../types';

/**
 * The canvas distance over which a pixel is measured: a long distance keeps
 * the precision of a transform that works in single precision far from the
 * origin of its world, as the map of a whole slide does.
 */
const MEASURED_PIXELS = 1024;

/**
 * The size of a canvas pixel in world units along each canvas axis, by the
 * canvas to world transform of a view: the world distance between the
 * canvas points `[0, 0]` and `[n, 0]`, and between `[0, 0]` and `[0, n]`,
 * over `n`. The transform of a view is affine, so any pixel gives the same
 * size.
 */
export function getCanvasPixelWorldSize(
  canvasToWorld: (canvasPos: Point2) => Point3
): Point2 {
  const origin = canvasToWorld([0, 0]);
  const right = canvasToWorld([MEASURED_PIXELS, 0]);
  const down = canvasToWorld([0, MEASURED_PIXELS]);

  return [
    Math.hypot(
      right[0] - origin[0],
      right[1] - origin[1],
      right[2] - origin[2]
    ) / MEASURED_PIXELS,
    Math.hypot(down[0] - origin[0], down[1] - origin[1], down[2] - origin[2]) /
      MEASURED_PIXELS,
  ];
}

/**
 * The pan in world units of a pan in canvas pixels on the screen, for
 * canvas pixels of the given size in world units.
 */
export function toWorldPan(canvasPan: Point2, pixelSize: Point2): Point2 {
  return [canvasPan[0] * pixelSize[0], canvasPan[1] * pixelSize[1]];
}

/**
 * The pan in canvas pixels on the screen of a pan in world units, for
 * canvas pixels of the given size in world units. Undefined when a pixel
 * has no size, as on a view that shows nothing.
 */
export function toCanvasPan(
  worldPan: Point2,
  pixelSize: Point2
): Point2 | undefined {
  if (!(pixelSize[0] > 0) || !(pixelSize[1] > 0)) {
    return;
  }

  return [worldPan[0] / pixelSize[0], worldPan[1] / pixelSize[1]];
}

/**
 * The pan in canvas pixels on the screen that a framing patch asks for, on
 * the view that the patch gives: its `worldPan` through the size of a
 * canvas pixel of that view, else its `pan`, in canvas pixels at zoom 1,
 * times the scale of each axis of that view. Undefined when the patch has
 * neither, or only a `worldPan` and no pixel size to measure it with.
 *
 * @param framing - The pan keys of the patch.
 * @param scale - The scale of each canvas axis of the view, against the fit.
 * @param pixelSize - The size of a canvas pixel of the view in world units.
 */
export function getPatchCanvasPan(
  framing: { pan?: Point2; worldPan?: Point2 },
  scale: Point2,
  pixelSize?: Point2
): Point2 | undefined {
  const { pan, worldPan } = framing;
  const fromWorld = worldPan && pixelSize && toCanvasPan(worldPan, pixelSize);

  if (fromWorld) {
    return fromWorld;
  }

  return pan && [pan[0] * scale[0], pan[1] * scale[1]];
}
