/**
 * A {@link https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillStyle|color, gradient or pattern} to use inside shapes.
 * @typedef {(String|CanvasGradient|CanvasPattern)} FillStyle
 */

/**
 * A {@link https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeStyle|color, gradient or pattern} to use for the lines around shapes.
 * @typedef {(String|CanvasGradient|CanvasPattern)} StrokeStyle
 */

/**
 * @callback ContextFn
 * @param {CanvasRenderingContext2D} context
 */

import draw from './draw.js';
import drawArrow from './drawArrow.js';
import drawCircle from './drawCircle.js';
import drawEllipse from './drawEllipse.js';
import drawHandles from './drawHandles.js';
import drawJoinedLines from './drawJoinedLines.js';
import drawLine from './drawLine.js';
import drawLines from './drawLines.js';
import drawLink from './drawLink.js';
import drawLinkedTextBox from './drawLinkedTextBox.js';
import drawRect from './drawRect.js';
import drawTextBox from './drawTextBox.js';
import fillBox from './fillBox.js';
import fillOutsideRect from './fillOutsideRect.js';
import fillTextLines from './fillTextLines.js';
import getNewContext from './getNewContext.js';
import path from './path.js';
import setShadow from './setShadow.js';

// Named exports
export {
  draw,
  drawArrow,
  drawCircle,
  drawEllipse,
  drawHandles,
  drawJoinedLines,
  drawLine,
  drawLines,
  drawLink,
  drawLinkedTextBox,
  drawRect,
  drawTextBox,
  fillBox,
  fillOutsideRect,
  fillTextLines,
  getNewContext,
  path,
  setShadow,
};

export default {
  draw,
  drawArrow,
  drawCircle,
  drawEllipse,
  drawHandles,
  drawJoinedLines,
  drawLine,
  drawLines,
  drawLink,
  drawLinkedTextBox,
  drawRect,
  drawTextBox,
  fillBox,
  fillOutsideRect,
  fillTextLines,
  getNewContext,
  path,
  setShadow,
};
