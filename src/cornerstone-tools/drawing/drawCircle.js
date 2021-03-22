import path from './path.js';

/**
 * Draw a circle with given `center` and `radius`.
 * @public
 * @method drawCircle
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {Object} center - `{ x, y }` in either pixel or canvas coordinates.
 * @param {number} radius - The circle's radius in canvas units.
 * @param {Object} options - See {@link path}
 * @returns {undefined}
 */
export default function(context, center, radius, options) {
  path(context, options, context => {
    context.arc(center[0], center[1], radius, 0, 2 * Math.PI);
  });
}
