import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types';
import drawLine from './drawLine';

export default function drawHeight(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  heightUID: string,
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

  // Drawing the head height with three lines
  // Variables to be used when creating the height
  const midX = end[0] + (start[0] - end[0]) / 2;
  const endfirstLine = [midX, start[1]] as Types.Point2;
  const endsecondLine = [midX, end[1]] as Types.Point2;

  const firstLine = {
    start: start,
    end: endfirstLine,
  };

  const secondLine = {
    start: endfirstLine,
    end: endsecondLine,
  };

  const threeLine = {
    start: endsecondLine,
    end: end,
  };

  //1
  drawLine(
    svgDrawingHelper,
    annotationUID,
    '1',
    firstLine.start,
    firstLine.end,
    {
      color,
      width,
      lineWidth,
    }
  );

  //2
  drawLine(
    svgDrawingHelper,
    annotationUID,
    '2',
    secondLine.start,
    secondLine.end,
    {
      color,
      width,
      lineWidth,
    }
  );

  //3
  drawLine(
    svgDrawingHelper,
    annotationUID,
    '3',
    threeLine.start,
    threeLine.end,
    {
      color,
      width,
      lineWidth,
    }
  );
}
