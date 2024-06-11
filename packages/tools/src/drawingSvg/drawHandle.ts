import type { Types } from '@cornerstonejs/core';

import _getHash from './_getHash';
import setNewAttributesIfValid from './setNewAttributesIfValid';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import { SVGDrawingHelper } from '../types';

function drawHandle(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  handleGroupUID: string,
  handle: Types.Point2,
  options = {},
  uniqueIndex
): void {
  const { color, handleRadius, width, lineWidth, fill, type, opacity } =
    Object.assign(
      {
        color: 'rgb(0, 255, 0)',
        handleRadius: '6',
        width: '2',
        lineWidth: undefined,
        fill: 'transparent',
        type: 'circle',
        opacity: 1,
      },
      options
    );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  // variable for the namespace
  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(
    annotationUID,
    'handle',
    `hg-${handleGroupUID}-index-${uniqueIndex}`
  );

  let attributes;
  if (type === 'circle') {
    attributes = {
      cx: `${handle[0]}`,
      cy: `${handle[1]}`,
      r: handleRadius,
      stroke: color,
      fill,
      'stroke-width': strokeWidth,
      opacity: opacity,
    };
  } else if (type === 'rect') {
    const handleRadiusFloat = parseFloat(handleRadius);
    const side = handleRadiusFloat * 1.5;
    const x = handle[0] - side * 0.5;
    const y = handle[1] - side * 0.5;

    attributes = {
      x: `${x}`,
      y: `${y}`,
      width: `${side}`,
      height: `${side}`,
      stroke: color,
      fill,
      'stroke-width': strokeWidth,
      rx: `${side * 0.1}`,
      opacity: opacity,
    };
  } else {
    throw new Error(`Unsupported handle type: ${type}`);
  }

  const existingHandleElement = svgDrawingHelper.getSvgNode(svgNodeHash);

  if (existingHandleElement) {
    setAttributesIfNecessary(attributes, existingHandleElement);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newHandleElement = document.createElementNS(svgns, type);

    setNewAttributesIfValid(attributes, newHandleElement);

    svgDrawingHelper.appendNode(newHandleElement, svgNodeHash);
  }
}

export default drawHandle;
