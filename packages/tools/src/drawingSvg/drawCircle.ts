import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';

import setAttributesIfNecessary from './setAttributesIfNecessary';
import setNewAttributesIfValid from './setNewAttributesIfValid';
import _draw from './_draw';

function drawCircle(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  circleUID: string,
  center: Types.Point2,
  radius: number,
  options = {}
): void {
  const {
    color,
    fill,
    width,
    lineWidth,
    lineDash,
    fillOpacity,
    strokeOpacity,
  } = Object.assign(
    {
      color: 'rgb(0, 255, 0)',
      fill: 'transparent',
      width: '2',
      lineDash: undefined,
      lineWidth: undefined,
      strokeOpacity: 1,
      fillOpacity: 1,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  const attributes = {
    cx: `${center[0]}`,
    cy: `${center[1]}`,
    r: `${radius}`,
    stroke: color,
    fill,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
    'fill-opacity': fillOpacity, // setting fill opacity
    'stroke-opacity': strokeOpacity, // setting stroke opacity
  };

  _draw('circle', svgDrawingHelper, annotationUID, circleUID, attributes);
}

export default drawCircle;
