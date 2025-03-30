import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';
import _setAttributesIfNecessary from './setAttributesIfNecessary';
import _setNewAttributesIfValid from './setNewAttributesIfValid';
import _draw from './_draw';

// <rect x="120" y="100" width="100" height="100" />
export default function drawRedactionRect(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  rectangleUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {}
): void {
  const {
    color,
    width: _width,
    lineWidth,
    lineDash,
  } = Object.assign(
    {
      color: 'rgb(0, 255, 0)',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || _width;

  const tlhc = [Math.min(start[0], end[0]), Math.min(start[1], end[1])];
  const width = Math.abs(start[0] - end[0]);
  const height = Math.abs(start[1] - end[1]);

  const attributes = {
    x: `${tlhc[0]}`,
    y: `${tlhc[1]}`,
    width: `${width}`,
    height: `${height}`,
    stroke: color,
    fill: 'black',
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };
  _draw('rect', svgDrawingHelper, annotationUID, rectangleUID, attributes);
}
