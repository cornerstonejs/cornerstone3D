import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';
import drawLine from './drawLine';

const svgns = 'http://www.w3.org/2000/svg';

/**
 * Draws an arrow annotation using SVG elements. The arrow can be drawn in two ways:
 * 1. Using a marker element (via markerEndId) - better for consistent arrowheads.
 * 2. Using two additional lines for the arrowhead - the older "legacy" method.
 */
export default function drawArrow(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  arrowUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {}
): void {
  if (isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
    return;
  }

  const {
    viaMarker = false,
    color = 'rgb(0, 255, 0)',
    markerSize = 10,
  } = options as {
    viaMarker?: boolean;
    color?: string;
    markerSize?: number;
    markerEndId?: string;
  };

  // If NOT using the marker-based approach, fall back to your two-line "legacy" approach:
  if (!viaMarker) {
    legacyDrawArrow(
      svgDrawingHelper,
      annotationUID,
      arrowUID,
      start,
      end,
      options as {
        color?: string;
        width?: number;
        lineWidth?: number;
        lineDash?: string;
      }
    );
    return;
  }
  const layerId = svgDrawingHelper.svgLayerElement.id;
  const markerBaseId = `arrow-${annotationUID}`;
  const markerFullId = `${markerBaseId}-${layerId}`;

  const defs = svgDrawingHelper.svgLayerElement.querySelector('defs');
  let arrowMarker = defs.querySelector(`#${markerFullId}`);

  if (!arrowMarker) {
    // Marker doesn't exist for this annotationUID, so create it
    arrowMarker = document.createElementNS(svgns, 'marker');
    arrowMarker.setAttribute('id', markerFullId);

    // Basic marker attributes
    arrowMarker.setAttribute('viewBox', '0 0 10 10');
    arrowMarker.setAttribute('refX', '8');
    arrowMarker.setAttribute('refY', '5');
    arrowMarker.setAttribute('markerWidth', `${markerSize}`);
    arrowMarker.setAttribute('markerHeight', `${markerSize}`);
    arrowMarker.setAttribute('orient', 'auto');

    // Create the <path> for the arrowhead shape
    const arrowPath = document.createElementNS(svgns, 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', color);

    arrowMarker.appendChild(arrowPath);
    defs.appendChild(arrowMarker);
  } else {
    // Marker already exists for this annotationUID; update color & size
    arrowMarker.setAttribute('markerWidth', `${markerSize}`);
    arrowMarker.setAttribute('markerHeight', `${markerSize}`);

    const arrowPath = arrowMarker.querySelector('path');
    if (arrowPath) {
      arrowPath.setAttribute('fill', color);
    }
  }

  (options as { markerEndId?: string }).markerEndId = markerFullId;

  drawLine(svgDrawingHelper, annotationUID, arrowUID, start, end, options);
}

function legacyDrawArrow(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  arrowUID: string,
  start: Types.Point2,
  end: Types.Point2,
  options = {} as {
    color?: string;
    width?: number;
    lineWidth?: number;
    lineDash?: string;
  }
): void {
  const { color = 'rgb(0, 255, 0)', width = 2, lineWidth, lineDash } = options;
  debugger;
  // Drawing the head arrow with two lines
  // Variables to be used when creating the arrow
  const headLength = 10;
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);

  const firstLine = {
    start: [
      end[0] - headLength * Math.cos(angle - Math.PI / 7),
      end[1] - headLength * Math.sin(angle - Math.PI / 7),
    ] as Types.Point2,
    end: end,
  };

  const secondLine = {
    start: [
      end[0] - headLength * Math.cos(angle + Math.PI / 7),
      end[1] - headLength * Math.sin(angle + Math.PI / 7),
    ] as Types.Point2,
    end: end,
  };

  // the main line
  drawLine(svgDrawingHelper, annotationUID, arrowUID, start, end, {
    color,
    width,
    lineWidth,
    lineDash,
  });

  drawLine(
    svgDrawingHelper,
    annotationUID,
    '2',
    firstLine.start,
    firstLine.end,
    {
      color,
      width,
      lineWidth,
      lineDash,
    }
  );

  drawLine(
    svgDrawingHelper,
    annotationUID,
    '3',
    secondLine.start,
    secondLine.end,
    {
      color,
      width,
      lineWidth,
      lineDash,
    }
  );
}
