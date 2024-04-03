import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types';

import _getHash from './_getHash';

import setAttributesIfNecessary from './setAttributesIfNecessary';
import setNewAttributesIfValid from './setNewAttributesIfValid';

function drawCircle(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  circleUID: string,
  center: Types.Point2,
  radius: number,
  options = {},
  dataId = ''
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

  // variable for the namespace
  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'circle', circleUID);
  const existingCircleElement = svgDrawingHelper.getSvgNode(svgNodeHash);

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

  if (existingCircleElement) {
    setAttributesIfNecessary(attributes, existingCircleElement);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newCircleElement = document.createElementNS(svgns, 'circle');

    if (dataId !== '') {
      newCircleElement.setAttribute('data-id', dataId);
    }

    setNewAttributesIfValid(attributes, newCircleElement);

    svgDrawingHelper.appendNode(newCircleElement, svgNodeHash);
  }
}

export default drawCircle;
