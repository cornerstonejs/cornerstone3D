import type { Types } from '@cornerstonejs/core';

import { SVGDrawingHelper } from '../types';
import drawHandle from './drawHandle';

function drawHandles(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  handleGroupUID: string,
  handlePoints: Array<Types.Point2>,
  options = {}
): void {
  handlePoints.forEach((handle, i) => {
    drawHandle(
      svgDrawingHelper,
      annotationUID,
      handleGroupUID,
      handle,
      options,
      i
    );
  });
}

export default drawHandles;
