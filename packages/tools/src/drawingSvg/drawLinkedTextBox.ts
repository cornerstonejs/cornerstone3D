import type { Types } from '@cornerstonejs/core';

import drawTextBox from './drawTextBox';
import drawLink from './drawLink';
import { SVGDrawingHelper } from '../types';

function drawLinkedTextBox(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  textBoxUID: string,
  //
  textLines: Array<string>,
  textBoxPosition: Types.Point2,
  annotationAnchorPoints: Array<Types.Point2>,
  textBox: unknown,
  options = {}
  // TODO: yCenter as an option
): SVGRect {
  const mergedOptions = Object.assign(
    {
      handleRadius: '6',
      centering: {
        x: false,
        y: true, // yCenter,
      },
    },
    options
  );

  // Draw the text box
  const canvasBoundingBox = drawTextBox(
    svgDrawingHelper,
    annotationUID,
    textBoxUID,
    textLines,
    textBoxPosition,
    mergedOptions
  );
  // if (textBox.hasMoved) {
  //   // Draw dashed link line between tool and text
  drawLink(
    svgDrawingHelper,
    annotationUID,
    textBoxUID,
    annotationAnchorPoints, // annotationAnchorPoints
    textBoxPosition, // refPoint (text)
    canvasBoundingBox, // textBoxBoundingBox
    mergedOptions
  );
  // }

  // const { top, left, width, height } = canvasBoundingBox

  // textBox.worldBoundingBox = {
  //   topLeft: canvasToWorld([left, top]),
  //   topRight: canvasToWorld([left + width, top]),
  //   bottomLeft: canvasToWorld([left, top + height]),
  //   bottomRight: canvasToWorld([left + width, top + height]),
  // }

  return canvasBoundingBox;
}

export default drawLinkedTextBox;
