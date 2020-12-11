import drawTextBox from './drawTextBox.js';
import drawLink from './drawLink.js';

export default function(
  context,
  textCoords,
  text,
  textBox,
  textBoxAnchorPoints,
  canvasToWorld,
  color,
  lineWidth,
  xOffset,
  yCenter
) {
  if (xOffset) {
    textCoords[0] += xOffset;
  }

  const options = {
    centering: {
      x: false,
      y: yCenter,
    },
  };

  // Draw the text box
  const canvasBoundingBox = drawTextBox(
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
      canvasBoundingBox,
      context,
      color,
      lineWidth
    );
  }

  const { top, left, width, height } = canvasBoundingBox;

  textBox.worldBoundingBox = {
    topLeft: canvasToWorld([left, top]),
    topRight: canvasToWorld([left + width, top]),
    bottomLeft: canvasToWorld([left, top + height]),
    bottomRight: canvasToWorld([left + width, top + height]),
  };
}
