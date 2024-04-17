import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types';

import _getHash from './_getHash';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import setNewAttributesIfValid from './setNewAttributesIfValid';

function drawEllipseByCoordinates(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  ellipseUID: string,
  canvasCoordinates: [Types.Point2, Types.Point2, Types.Point2, Types.Point2],
  options = {},
  dataId = ''
): void {
  const { color, width, lineWidth, lineDash } = Object.assign(
    {
      color: 'rgb(0, 255, 0)',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'ellipse', ellipseUID);
  const existingEllipse = svgDrawingHelper.getSvgNode(svgNodeHash);

  const [bottom, top, left, right] = canvasCoordinates;

  const w = Math.hypot(left[0] - right[0], left[1] - right[1]);
  const h = Math.hypot(top[0] - bottom[0], top[1] - bottom[1]);
  const angle =
    (Math.atan2(left[1] - right[1], left[0] - right[0]) * 180) / Math.PI;

  const center = [(left[0] + right[0]) / 2, (top[1] + bottom[1]) / 2];
  const radiusX = w / 2;
  const radiusY = h / 2;

  const attributes = {
    cx: `${center[0]}`,
    cy: `${center[1]}`,
    rx: `${radiusX}`,
    ry: `${radiusY}`,
    stroke: color,
    fill: 'transparent',
    transform: `rotate(${angle} ${center[0]} ${center[1]})`,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };

  if (existingEllipse) {
    setAttributesIfNecessary(attributes, existingEllipse);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const svgEllipseElement = document.createElementNS(svgns, 'ellipse');

    if (dataId !== '') {
      svgEllipseElement.setAttribute('data-id', dataId);
    }

    setNewAttributesIfValid(attributes, svgEllipseElement);

    svgDrawingHelper.appendNode(svgEllipseElement, svgNodeHash);
  }
}

export default drawEllipseByCoordinates;
