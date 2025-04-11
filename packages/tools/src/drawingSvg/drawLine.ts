import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';
import _draw from './_draw';

export default function drawLine(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  lineUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {}
): void {
  // if length is NaN return
  if (isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
    return;
  }

  const {
    color = 'rgb(0, 255, 0)',
    width = 10,
    lineWidth,
    lineDash,
    markerStartId = null,
    markerEndId = null,
    shadow = false,
  } = options as {
    color?: string;
    width?: string;
    lineWidth?: string;
    lineDash?: string;
    markerStartId?: string;
    markerEndId?: string;
    shadow?: boolean;
  };

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  const layerId = svgDrawingHelper.svgLayerElement.id;
  const dropShadowStyle = shadow ? `filter:url(#shadow-${layerId});` : '';

  const attributes = {
    x1: `${start[0]}`,
    y1: `${start[1]}`,
    x2: `${end[0]}`,
    y2: `${end[1]}`,
    stroke: color,
    style: dropShadowStyle,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
    'marker-start': markerStartId ? `url(#${markerStartId})` : '',
    'marker-end': markerEndId ? `url(#${markerEndId})` : '',
  };

  _draw('line', svgDrawingHelper, annotationUID, lineUID, attributes);
}
