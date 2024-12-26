import type { Types } from '@cornerstonejs/core';

import _getHash from './_getHash';
import setNewAttributesIfValid from './setNewAttributesIfValid';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import type { SVGDrawingHelper } from '../types';

export default function drawLine(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  lineUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options: {
    color?: string;
    width?: number;
    lineWidth?: number;
    lineDash?: string;
    markerStartId?: string;
    markerEndId?: string;
    shadow?: boolean;
  },
  dataId = ''
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
  } = options;

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'line', lineUID);
  const existingLine = svgDrawingHelper.getSvgNode(svgNodeHash);
  const layerId = svgDrawingHelper.svgLayerElement.id;
  const dropShadowStyle = shadow ? `filter:url(#shadow-${layerId});` : '';
  const arrow = svgDrawingHelper.svgLayerElement.querySelector(
    `#${markerEndId}-${layerId}`
  );

  if (arrow) {
    arrow.setAttribute('fill', color);
    const newstrokeWidth = strokeWidth >= 4 ? 3 : 6;
    arrow.setAttribute('markerWidth', `${newstrokeWidth}`);
    arrow.setAttribute('markerHeight', `${newstrokeWidth}`);
  }

  const attributes = {
    x1: `${start[0]}`,
    y1: `${start[1]}`,
    x2: `${end[0]}`,
    y2: `${end[1]}`,
    stroke: color,
    style: dropShadowStyle,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
    'marker-start': markerStartId ? `url(#${markerStartId}-${layerId})` : '',
    'marker-end': markerEndId ? `url(#${markerEndId}-${layerId})` : '',
  };

  if (existingLine) {
    // This is run to avoid re-rendering annotations that actually haven't changed
    setAttributesIfNecessary(attributes, existingLine);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newLine = document.createElementNS(svgns, 'line');

    if (dataId !== '') {
      newLine.setAttribute('data-id', dataId);
    }

    setNewAttributesIfValid(attributes, newLine);

    svgDrawingHelper.appendNode(newLine, svgNodeHash);
  }
}
