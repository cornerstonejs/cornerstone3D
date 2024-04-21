import type { Types } from '@cornerstonejs/core';

import _getHash from './_getHash';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import setNewAttributesIfValid from './setNewAttributesIfValid';
import { SVGDrawingHelper } from '../types';

export default function drawRectByCoordinates(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  rectangleUID: string,
  canvasCoordinates: Types.Point2[],
  options = {},
  dataId = ''
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

  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'rect', rectangleUID);
  const existingRect = svgDrawingHelper.getSvgNode(svgNodeHash);

  const [topLeft, topRight, bottomLeft, bottomRight] = canvasCoordinates;

  const width = Math.hypot(topLeft[0] - topRight[0], topLeft[1] - topRight[1]);
  const height = Math.hypot(
    topLeft[0] - bottomLeft[0],
    topLeft[1] - bottomLeft[1]
  );

  const center = [
    (bottomRight[0] + topLeft[0]) / 2,
    (bottomRight[1] + topLeft[1]) / 2,
  ];
  const leftEdgeCenter = [
    (bottomLeft[0] + topLeft[0]) / 2,
    (bottomLeft[1] + topLeft[1]) / 2,
  ];
  const angle =
    (Math.atan2(center[1] - leftEdgeCenter[1], center[0] - leftEdgeCenter[0]) *
      180) /
    Math.PI;

  const attributes = {
    x: `${center[0] - width / 2}`,
    y: `${center[1] - height / 2}`,
    width: `${width}`,
    height: `${height}`,
    stroke: color,
    fill: 'transparent',
    transform: `rotate(${angle} ${center[0]} ${center[1]})`,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };

  if (existingRect) {
    setAttributesIfNecessary(attributes, existingRect);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const svgRectElement = document.createElementNS(svgns, 'rect');

    if (dataId !== '') {
      svgRectElement.setAttribute('data-id', dataId);
    }

    setNewAttributesIfValid(attributes, svgRectElement);

    svgDrawingHelper.appendNode(svgRectElement, svgNodeHash);
  }
}
