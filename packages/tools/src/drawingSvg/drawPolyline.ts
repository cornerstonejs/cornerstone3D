import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';
import _draw from './_draw';

/**
 * Draws an SVG polyline with the given points.
 *
 * The `closePath` option, if true, draws a closed polyline, with the
 * last point connected to the first.
 */
export default function drawPolyline(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  polylineUID: string,
  points: Types.Point2[],
  options: {
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    width?: number;
    lineWidth?: number;
    lineDash?: string;
    closePath?: boolean;
    markerStartId?: string;
    markerEndId?: string;
  }
): void {
  if (points.length < 2) {
    return;
  }

  const {
    color = 'rgb(0, 255, 0)',
    width = 10,
    fillColor = 'none',
    fillOpacity = 0,
    lineWidth,
    lineDash,
    closePath = false,
    markerStartId = null,
    markerEndId = null,
  } = options;

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;
  let pointsAttribute = '';

  for (const point of points) {
    pointsAttribute += `${point[0].toFixed(1)}, ${point[1].toFixed(1)} `;
  }

  if (closePath) {
    const firstPoint = points[0];

    pointsAttribute += `${firstPoint[0]}, ${firstPoint[1]}`;
  }

  const attributes = {
    points: pointsAttribute,
    stroke: color,
    fill: fillColor,
    'fill-opacity': fillOpacity,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
    'marker-start': markerStartId ? `url(#${markerStartId})` : '',
    'marker-end': markerEndId ? `url(#${markerEndId})` : '',
  };
  _draw('polyline', svgDrawingHelper, annotationUID, polylineUID, attributes);
}
