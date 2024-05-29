import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types/index.js';

import _getHash from './_getHash.js';
import drawEllipseByCoordinates from './drawEllipseByCoordinates.js';

function drawEllipse(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  ellipseUID: string,
  corner1: Types.Point2,
  corner2: Types.Point2,
  options = {},
  dataId = ''
) {
  const top: Types.Point2 = [(corner1[0] + corner2[0]) / 2, corner1[1]];
  const bottom: Types.Point2 = [(corner1[0] + corner2[0]) / 2, corner2[1]];
  const left: Types.Point2 = [corner1[0], (corner1[1] + corner2[1]) / 2];
  const right: Types.Point2 = [corner2[0], (corner1[1] + corner2[1]) / 2];

  drawEllipseByCoordinates(
    svgDrawingHelper,
    annotationUID,
    ellipseUID,
    [bottom, top, left, right],
    (options = {}),
    (dataId = '')
  );
}

export default drawEllipse;
