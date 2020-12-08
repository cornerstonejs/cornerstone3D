import path from './path.js';

/**
 * Draw multiple lines.
 * @public
 * @method drawJoinedLines
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {Object[]} lines - `[{ start: [x, y], end: [ x, y ]}]` An array of `start`, `end` pairs.
 * @param {Object} options - See {@link path}
 * @returns {undefined}
 */
export default function(context, lines, options) {
  path(context, options, context => {
    lines.forEach(line => {
      const { start, end } = line;

      context.moveTo(start[0], start[1]);
      context.lineTo(end[0], end[1]);
    });
  });
}
