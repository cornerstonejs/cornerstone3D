import path from './path.js';

/**
 * Draw a line between `start` and `end`.
 *
 * @public
 * @method drawLine
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context
 * @param {Object} start - Start in canvas coordinates.
 * @param {Object} end - End in canvas coordinates.
 * @param {Object} options - See {@link path}
 * @returns {undefined}
 */
export default function drawLine(context, start, end, options) {
  path(context, options, context => {
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
  });
}
