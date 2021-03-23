import path from './path'

/**
 * Fill the region outside a rectangle defined by `corner1` and `corner2`.
 * @public
 * @method fillOutsideRect
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {Object} corner1 - First corner in canvas coordinates.
 * @param {Object} corner2 - Second corner in canvas coordinates.
 * @param {Object} options - See {@link path}
 * @returns {undefined}
 */
export default function (context, corner1, corner2, options) {
  const left = Math.min(corner1[0], corner2[0])
  const top = Math.min(corner1[1], corner2[1])
  const width = Math.abs(corner1[0] - corner2[0])
  const height = Math.abs(corner1[1] - corner2[1])

  path(context, options, (context) => {
    context.rect(0, 0, context.canvas.clientWidth, context.canvas.clientHeight)
    context.rect(left + width, top, -width, height)
  })
}
