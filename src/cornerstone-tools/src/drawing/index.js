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

import draw from './draw'
import drawArrow from './drawArrow'
import drawCircle from './drawCircle'
import drawEllipse from './drawEllipse'
import drawHandles from './drawHandles'
import drawJoinedLines from './drawJoinedLines'
import drawLine from './drawLine'
import drawLines from './drawLines'
import drawLink from './drawLink'
import drawLinkedTextBox from './drawLinkedTextBox'
import drawRect from './drawRect'
import drawTextBox from './drawTextBox'
import fillBox from './fillBox'
import fillOutsideRect from './fillOutsideRect'
import fillTextLines from './fillTextLines'
import getNewContext from './getNewContext'
import path from './path'
import setShadow from './setShadow'

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
}

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
}
