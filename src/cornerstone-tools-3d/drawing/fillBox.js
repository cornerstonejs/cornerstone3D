/**
 * Draw a filled rectangle defined by `boundingBox` using the style defined by `fillStyle`.
 * @public
 * @method fillBox
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {Object} boundingBox - `{ left, top, width, height }` in canvas coordinates.
 * @param {FillStyle} fillStyle - The fillStyle to apply to the region.
 * @returns {undefined}
 */
export default function(context, boundingBox, fillStyle) {
  context.fillStyle = fillStyle;
  context.fillRect(
    boundingBox.left,
    boundingBox.top,
    boundingBox.width,
    boundingBox.height
  );
}
