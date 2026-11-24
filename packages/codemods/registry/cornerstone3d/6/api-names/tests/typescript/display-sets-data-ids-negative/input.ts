import { drawing } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';

const { drawLine } = drawing;

/** A tool of the application: `dataId` is the data-id attribute of an SVG line. */
export function renderLine(
  svgDrawingHelper: unknown,
  annotationUID: string,
  start: Types.Point2,
  end: Types.Point2
) {
  const dataId = `${annotationUID}-line`;

  drawLine(svgDrawingHelper as never, annotationUID, 'line', start, end, {}, dataId);
}

/** OHIF's id of a display set shape. */
export function dataIdOf(displaySetInstanceUID: string, shape?: 'stack' | 'volume') {
  const dataId = shape ? `${displaySetInstanceUID}::${shape}` : displaySetInstanceUID;

  return dataId;
}
