import type { Types } from '@cornerstonejs/core';
import _getHash from './_getHash';
import setNewAttributesIfValid from './setNewAttributesIfValid';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import { SVGDrawingHelper } from '../types';

/**
 * Draws an SVG path with the given points.
 *
 * The `closePath` option, if true, draws a closed path (last point
 * connected to the first).
 */
export default function drawPath(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  pathUID: string,
  points: Types.Point2[] | Types.Point2[][],
  options: {
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    width?: number;
    lineWidth?: number;
    lineDash?: string;
    closePath?: boolean;
  }
): void {
  // It may be a polyline with holes that will be an array with multiple
  // 'points' arrays
  const hasSubArrays =
    points.length && points[0].length && Array.isArray(points[0][0]);

  const pointsArrays = hasSubArrays ? points : [points];
  const {
    color = 'dodgerblue',
    width = 10,
    fillColor = 'none',
    fillOpacity = 0,
    lineWidth,
    lineDash,
    closePath = false,
  } = options;

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'path', pathUID);
  const existingNode = svgDrawingHelper.getSvgNode(svgNodeHash);
  let pointsAttribute = '';

  for (let i = 0, numArrays = pointsArrays.length; i < numArrays; i++) {
    const points = pointsArrays[i];
    const numPoints = points.length;

    if (numPoints < 2) {
      continue;
    }

    for (let j = 0; j < numPoints; j++) {
      const point = points[j];
      const cmd = j ? 'L' : 'M';

      pointsAttribute += `${cmd} ${point[0].toFixed(1)}, ${point[1].toFixed(
        1
      )} `;
    }

    if (closePath) {
      pointsAttribute += 'Z ';
    }
  }

  if (!pointsAttribute) {
    return;
  }

  const attributes = {
    d: pointsAttribute,
    stroke: color,
    fill: fillColor,
    'fill-opacity': fillOpacity,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
  };

  if (existingNode) {
    // This is run to avoid re-rendering annotations that actually haven't changed
    setAttributesIfNecessary(attributes, existingNode);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newNode = document.createElementNS(svgns, 'path');

    setNewAttributesIfValid(attributes, newNode);
    svgDrawingHelper.appendNode(newNode, svgNodeHash);
  }
}
