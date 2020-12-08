import drawTextBox from './drawTextBox.js';
import drawLink from './drawLink.js';

/**
 * Draw a link between an annotation to a textBox.
 * @public
 * @method drawLinkedTextBox
 * @memberof Drawing
 *
 * @param {Object} context - The canvas context.
 * @param {Object} textBox - The textBox to link.
 * @param {Object} text - The text to display in the textbox.
 * @param {Object[]} handles - The handles of the annotation.
 * @param {Object[]} textBoxAnchorPoints - An array of possible anchor points on the textBox.
 * @param {string} color - The link color.
 * @param {number} lineWidth - The line width of the link.
 * @param {number} xOffset - The x offset of the textbox.
 * @param {boolean} yCenter - Vertically centers the text if true.
 * @returns {undefined}
 */
export default function(
  context,
  textCoords,
  text,
  handles,
  textBoxAnchorPoints,
  color,
  lineWidth,
  xOffset,
  yCenter
) {
  const cornerstone = external.cornerstone;

  if (xOffset) {
    textCoords.x += xOffset;
  }

  const options = {
    centering: {
      x: false,
      y: yCenter,
    },
  };

  // Draw the text box
  textBox.boundingBox = drawTextBox(
    context,
    text,
    textCoords[0],
    textCoords[1],
    color,
    options
  );
  if (textBox.hasMoved) {
    // Draw dashed link line between tool and text
    drawLink(
      textBoxAnchorPoints,
      textCoords,
      textBox.boundingBox,
      context,
      color,
      lineWidth
    );
  }
}
