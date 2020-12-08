import textStyle from '../stateManagement/textStyle.js';
import draw from './draw.js';
import fillTextLines from './fillTextLines.js';
import fillBox from './fillBox.js';

/**
 * Compute the width of the box required to display the given `text` with a given `padding`.
 * @public
 * @function textBoxWidth
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {String} text - The text to find the width of.
 * @param {Number} padding - The padding to apply on either end of the text.
 * @returns {Number} computed text box width
 */
export function textBoxWidth(context, text, padding) {
  const font = textStyle.getFont();
  const origFont = context.font;

  if (font && font !== origFont) {
    context.font = font;
  }
  const width = context.measureText(text).width;

  if (font && font !== origFont) {
    context.font = origFont;
  }

  return width + 2 * padding;
}

/**
 * Draws a textBox.
 * @public
 * @function drawTextBox
 * @memberof Drawing
 *
 * @param  {CanvasRenderingContext2D} context The canvas context.
 * @param  {string} textLines   The text to display.
 * @param  {number} x           The x position of the textBox.
 * @param  {number} y           The y position of the textBox.
 * @param  {string} color       The color of the textBox.
 * @param  {Object} options     Options for the textBox.
 * @returns {Object} {top, left, width, height} - Bounding box; can be used for pointNearTool
 */
export default function(context, textLines, x, y, color, options) {
  if (Object.prototype.toString.call(textLines) !== '[object Array]') {
    textLines = [textLines];
  }

  const padding = 5;
  const fontSize = textStyle.getFontSize();
  const backgroundColor = textStyle.getBackgroundColor();

  // Find the longest text width in the array of text data
  let maxWidth = 0;

  textLines.forEach(function(text) {
    // Get the text width in the current font
    const width = textBoxWidth(context, text, padding);

    // Find the maximum with for all the text rows;
    maxWidth = Math.max(maxWidth, width);
  });

  // Calculate the bounding box for this text box
  const boundingBox = {
    width: maxWidth,
    height: padding + textLines.length * (fontSize + padding),
  };

  draw(context, context => {
    context.strokeStyle = color;

    // Draw the background box with padding
    if (options && options.centering && options.centering.x === true) {
      x -= boundingBox.width / 2;
    }

    if (options && options.centering && options.centering.y === true) {
      y -= boundingBox.height / 2;
    }

    boundingBox.left = x;
    boundingBox.top = y;

    const fillStyle =
      options && options.debug === true ? '#FF0000' : backgroundColor;

    fillBox(context, boundingBox, fillStyle);

    // Draw each of the text lines on top of the background box
    fillTextLines(context, boundingBox, textLines, color, padding);
  });

  // Return the bounding box so it can be used for pointNearHandle
  return boundingBox;
}
