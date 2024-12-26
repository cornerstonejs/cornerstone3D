import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';
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
      width: 2,
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
    markerEndId: 'arrow',
  });
}
