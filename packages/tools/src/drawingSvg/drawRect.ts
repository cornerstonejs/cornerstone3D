import type { Types } from '@cornerstonejs/core';

import _getHash from './_getHash';
import { SVGDrawingHelper } from '../types';
import drawRectByCoordinates from './drawRectByCoordinates';

// This method is obsolete due to not supporting rotation tool. Please use drawRectByCoordinates instead.
// <rect x="120" y="100" width="100" height="100" />
export default function drawRect(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  rectangleUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {},
  dataId = ''
): void {
  const topLeft: Types.Point2 = [start[0], start[1]];
  const topRight: Types.Point2 = [end[0], start[1]];
  const bottomLeft: Types.Point2 = [start[0], end[1]];
  const bottomRight: Types.Point2 = [end[0], end[1]];

  drawRectByCoordinates(
    svgDrawingHelper,
    annotationUID,
    rectangleUID,
    [topLeft, topRight, bottomLeft, bottomRight],
    options,
    dataId
  );
}
