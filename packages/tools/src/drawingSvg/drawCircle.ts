import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types';

import _getHash from './_getHash';

import _setAttributesIfNecessary from './_setAttributesIfNecessary';
import _setNewAttributesIfValid from './_setNewAttributesIfValid';

function drawCircle(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  circleUID: string,
  center: Types.Point2,
  radius: number,
  options = {},
  dataId = ''
): void {
  const { color, fill, width, lineWidth } = Object.assign(
    {
      color: 'dodgerblue',
      fill: 'transparent',
      width: '2',
      lineWidth: undefined,
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
  };

  if (existingCircleElement) {
    _setAttributesIfNecessary(attributes, existingCircleElement);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newCircleElement = document.createElementNS(svgns, 'circle');

    if (dataId !== '') {
      newCircleElement.setAttribute('data-id', dataId);
    }

    _setNewAttributesIfValid(attributes, newCircleElement);

    svgDrawingHelper.appendNode(newCircleElement, svgNodeHash);
  }
}

export default drawCircle;
