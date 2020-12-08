import path from './path.js';

/**
 * Draw an ellipse within the bounding box defined by `corner1` and `corner2`.
 * @public
 * @method drawEllipse
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {HTMLElement} element - The DOM Element to draw on
 * @param {Object} corner1 - In canvas coordinates.
 * @param {Object} corner2 - In canvas coordinates.
 * @param {Object} options - See {@link path}
 * @returns {undefined}
 */
export default function(context, corner1, corner2, options) {
  const w = Math.abs(corner1[0] - corner2[0]);
  const h = Math.abs(corner1[1] - corner2[1]);
  const xMin = Math.min(corner1[0], corner2[0]);
  const yMin = Math.min(corner1[1], corner2[1]);

  const center = [xMin + w / 2, yMin + h / 2];

  path(context, options, context => {
    context.ellipse(center[0], center[1], w / 2, h / 2, angle, 0, 2 * Math.PI);
    context.closePath();
  });
}
