import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types';
import drawLine from './drawLine';

export default function drawArrow(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  arrowUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {}
): void {
  // if length is NaN return
  if (isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
    return;
  }

  const { color, width, lineWidth, lineDash } = Object.assign(
    {
      color: 'rgb(0, 255, 0)',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
    },
    options
  );

  // The line itself
  drawLine(svgDrawingHelper, annotationUID, arrowUID, start, end, {
    color,
    width,
    lineWidth,
    lineDash,
  });

  // Drawing the head arrow with two lines
  // Variables to be used when creating the arrow
  const headLength = 10;
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);

  const firstLine = {
    start: [
      end[0] - headLength * Math.cos(angle - Math.PI / 7),
      end[1] - headLength * Math.sin(angle - Math.PI / 7),
    ] as Types.Point2,
    end: end,
  };

  const secondLine = {
    start: [
      end[0] - headLength * Math.cos(angle + Math.PI / 7),
      end[1] - headLength * Math.sin(angle + Math.PI / 7),
    ] as Types.Point2,
    end: end,
  };

  drawLine(
    svgDrawingHelper,
    annotationUID,
    '2',
    firstLine.start,
    firstLine.end,
    {
      color,
      width,
      lineWidth,
    }
  );

  drawLine(
    svgDrawingHelper,
    annotationUID,
    '3',
    secondLine.start,
    secondLine.end,
    {
      color,
      width,
      lineWidth,
    }
  );
}
