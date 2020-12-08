import path from './path.js';

/**
 * Draw a rectangle defined by `corner1` and `corner2`.
 * @public
 * @method drawRect
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {HTMLElement} element - The DOM Element to draw on
 * @param {Object} corner1 - `{ x, y }` in either pixel or canvas coordinates.
 * @param {Object} corner2 - `{ x, y }` in either pixel or canvas coordinates.
 * @param {Object} options - See {@link path}
 * @param {String} [coordSystem='pixel'] - Can be "pixel" (default) or "canvas". The coordinate
 *     system of the points passed in to the function. If "pixel" then cornerstone.pixelToCanvas
 *     is used to transform the points from pixel to canvas coordinates.
 * @param {Number} initialRotation - Rectangle initial rotation
 * @returns {undefined}
 */
export default function(context, corner1, corner2, options) {
  const w = Math.abs(corner1[0] - corner2[0]);
  const h = Math.abs(corner1[0] - corner2[1]);

  corner1 = {
    x: Math.min(corner1[0], corner2[0]),
    y: Math.min(corner1[1], corner2[1]),
  };

  corner2 = {
    x: corner1[0] + w,
    y: corner1[1] + h,
  };

  let corner3 = {
    x: corner1[0] + w,
    y: corner1[1],
  };

  let corner4 = {
    x: corner1[0],
    y: corner1[1] + h,
  };

  path(context, options, context => {
    context.moveTo(corner1[0], corner1[1]);
    context.lineTo(corner3[0], corner3[1]);
    context.moveTo(corner3[0], corner3[1]);
    context.lineTo(corner2[0], corner2[1]);
    context.moveTo(corner2[0], corner2[1]);
    context.lineTo(corner4[0], corner4[1]);
    context.moveTo(corner4[0], corner4[1]);
    context.lineTo(corner1[0], corner1[1]);
  });
}
