import type { Types } from '@cornerstonejs/core';
import setNewAttributesIfValid from './setNewAttributesIfValid';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import type { SVGDrawingHelper } from '../types';
import _draw from './_draw';

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
    color = 'rgb(0, 255, 0)',
    width = 10,
    fillColor = 'none',
    fillOpacity = 0,
    lineWidth,
    lineDash,
    closePath = false,
  } = options;

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

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

  _draw('path', svgDrawingHelper, annotationUID, pathUID, attributes);
}
