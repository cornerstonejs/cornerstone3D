/**
 * Create a new {@link CanvasRenderingContext2D|context} object for the given {@link HTMLCanvasElement|canvas}
 * and set the transform to the {@link https://www.w3.org/TR/2dcontext/#transformations|identity transform}.
 *
 * @public
 * @function getNewContext
 * @memberof Drawing
 *
 * @param {HTMLCanvasElement} canvas - Canvas you would like the context for
 * @returns {CanvasRenderingContext2D} - The provided canvas's 2d context
 */
export default function(canvas) {
  const context = canvas.getContext('2d');

  return context;
}
