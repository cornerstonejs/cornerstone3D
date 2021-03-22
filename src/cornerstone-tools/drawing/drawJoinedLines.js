import path from './path.js';

/**
 * Draw a series of joined lines, starting at `start` and then going to each point in `points`.
 * @public
 * @method drawJoinedLines
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {Object} start - Start in canvas coordinates.
 * @param {Object[]} points - Array of points in canvas coordinates.
 * @param {Object} options - See {@link path}
 * @returns {undefined}
 */
export default function(context, start, points, options) {
  path(context, options, context => {
    context.moveTo(start[0], start[1]);
    points.forEach(point => {
      context.lineTo(point[0], point[1]);
    });
  });
}
