import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';

import _getHash from './_getHash';

import setAttributesIfNecessary from './setAttributesIfNecessary';
import setNewAttributesIfValid from './setNewAttributesIfValid';

/**
 * Draw a fan shape (circular sector) on an SVG element
 *
 * @param svgDrawingHelper - The SVG drawing helper
 * @param annotationUID - The annotation unique identifier
 * @param fanUID - The fan shape unique identifier
 * @param center - The center point of the fan [x, y]
 * @param innerRadius - The inner radius of the fan
 * @param outerRadius - The outer radius of the fan
 * @param startAngle - The start angle of the fan in degrees
 * @param endAngle - The end angle of the fan in degrees
 * @param options - Drawing options (color, fill, etc.)
 * @param dataId - Optional data ID attribute
 */
function drawFan(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  fanUID: string,
  center: Types.Point2,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  options = {},
  dataId = ''
): void {
  const {
    color,
    fill,
    width,
    lineWidth,
    lineDash,
    fillOpacity,
    strokeOpacity,
  } = Object.assign(
    {
      color: 'rgb(0, 255, 0)',
      fill: 'transparent',
      width: '2',
      lineDash: undefined,
      lineWidth: undefined,
      strokeOpacity: 1,
      fillOpacity: 1,
    },
    options
  );

  // for supporting both lineWidth and width options
  const strokeWidth = lineWidth || width;

  // variable for the namespace
  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'fan', fanUID);
  const existingFanElement = svgDrawingHelper.getSvgNode(svgNodeHash);

  // Convert angles from degrees to radians
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  // Calculate points for the path
  const centerX = center[0];
  const centerY = center[1];

  // Calculate outer arc points
  const outerStartX = centerX + outerRadius * Math.cos(startRad);
  const outerStartY = centerY + outerRadius * Math.sin(startRad);
  const outerEndX = centerX + outerRadius * Math.cos(endRad);
  const outerEndY = centerY + outerRadius * Math.sin(endRad);

  // Calculate inner arc points
  const innerStartX = centerX + innerRadius * Math.cos(startRad);
  const innerStartY = centerY + innerRadius * Math.sin(startRad);
  const innerEndX = centerX + innerRadius * Math.cos(endRad);
  const innerEndY = centerY + innerRadius * Math.sin(endRad);

  // Determine if the arc should be drawn as a large arc (>180 degrees)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  // Create the SVG path
  let pathData = `M ${outerStartX} ${outerStartY}`; // Move to start of outer arc
  pathData += ` A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}`; // Draw outer arc
  pathData += ` L ${innerEndX} ${innerEndY}`; // Line to inner arc end point
  pathData += ` A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}`; // Draw inner arc (counter-clockwise)
  pathData += ` Z`; // Close path

  const attributes = {
    d: pathData,
    stroke: color,
    fill,
    'stroke-width': strokeWidth,
    'stroke-dasharray': lineDash,
    'fill-opacity': fillOpacity,
    'stroke-opacity': strokeOpacity,
  };

  if (existingFanElement) {
    setAttributesIfNecessary(attributes, existingFanElement);

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const newFanElement = document.createElementNS(svgns, 'path');

    if (dataId !== '') {
      newFanElement.setAttribute('data-id', dataId);
    }

    setNewAttributesIfValid(attributes, newFanElement);

    svgDrawingHelper.appendNode(newFanElement, svgNodeHash);
  }
}

export default drawFan;
