import type { Types } from '@cornerstonejs/core';
import _getHash from './_getHash';
import _setNewAttributesIfValid from './_setNewAttributesIfValid';
import _setAttributesIfNecessary from './_setAttributesIfNecessary';
import { SVGDrawingHelper } from '../types';

/**
 * Draws an SVG polyline with the given points.
 *
 * The `connectLastToFirst` option, if true, draws a closed polyline, with the
 * last point connected to the first.
 */
export default function drawPolyline(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  polylineUID: string,
  points: Types.Point2[],
  options: {
    color?: string;
    width?: number;
    lineWidth?: number;
    lineDash?: string;
    connectLastToFirst?: boolean;
  }
): void {
  if (points.length < 2) {
    return;
  }

  const { color, width, lineWidth, lineDash } = Object.assign(
    {
      color: 'dodgerblue',
      width: '2',
      lineWidth: undefined,
      lineDash: undefined,
      connectLastToFirst: false,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'polyline', polylineUID);
  const existingPolyLine = svgDrawingHelper.getSvgNode(svgNodeHash);

  let pointsAttribute = '';

  for (const point of points) {
    pointsAttribute += `${point[0]}, ${point[1]} `;
  }

  if (options.connectLastToFirst) {
    const firstPoint = points[0];

    pointsAttribute += `${firstPoint[0]}, ${firstPoint[1]}`;
  }

  const attributes = {
    points: pointsAttribute,
    stroke: color,
    fill: 'none',
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };

  if (existingPolyLine) {
    // This is run to avoid re-rendering annotations that actually haven't changed
    _setAttributesIfNecessary(attributes, existingPolyLine);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newPolyLine = document.createElementNS(svgns, 'polyline');

    _setNewAttributesIfValid(attributes, newPolyLine);

    svgDrawingHelper.appendNode(newPolyLine, svgNodeHash);
  }
}
