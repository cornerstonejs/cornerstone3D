import type { Types } from '@cornerstonejs/core';
import { SVGDrawingHelper } from '../types';

import _getHash from './_getHash';
import _setAttributesIfNecessary from './_setAttributesIfNecessary';
import _setNewAttributesIfValid from './_setNewAttributesIfValid';

function drawEllipse(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  ellipseUID: string,
  corner1: Types.Point2,
  corner2: Types.Point2,
  options = {},
  dataId = ''
): void {
  const { color, width, lineWidth, lineDash } = Object.assign(
    {
      color: 'dodgerblue',
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

  const w = Math.abs(corner1[0] - corner2[0]);
  const h = Math.abs(corner1[1] - corner2[1]);
  const xMin = Math.min(corner1[0], corner2[0]);
  const yMin = Math.min(corner1[1], corner2[1]);

  const center = [xMin + w / 2, yMin + h / 2];
  const radiusX = w / 2;
  const radiusY = h / 2;

  const attributes = {
    cx: `${center[0]}`,
    cy: `${center[1]}`,
    rx: `${radiusX}`,
    ry: `${radiusY}`,
    stroke: color,
    fill: 'transparent',
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };

  if (existingEllipse) {
    _setAttributesIfNecessary(attributes, existingEllipse);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const svgEllipseElement = document.createElementNS(svgns, 'ellipse');

    if (dataId !== '') {
      svgEllipseElement.setAttribute('data-id', dataId);
    }

    _setNewAttributesIfValid(attributes, svgEllipseElement);

    svgDrawingHelper.appendNode(svgEllipseElement, svgNodeHash);
  }
}

export default drawEllipse;
