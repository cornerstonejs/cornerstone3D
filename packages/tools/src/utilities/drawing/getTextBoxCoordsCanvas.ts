import type { Types } from '@cornerstonejs/core';
import {
  getRegisteredTextBoxes,
  type TextBoxRect,
} from './textBoxOverlapRegistry';
import intersectAABB from '../math/aabb/intersectAABB';

const VIEWPORT_ELEMENT = 'viewport-element';

// Minimum gap (px) between adjacent text boxes
const TEXT_BOX_GAP = 6;

/**
 * Determine the coordinates that will place the textbox to the right of the
 * annotation while keeping it inside viewport bounds when an element is provided.
 *
 * When an element is supplied the function also checks for overlap with
 * previously-rendered text boxes (tracked via the textBoxOverlapRegistry) and
 * nudges the new box vertically so that it does not occlude existing labels.
 *
 * @param annotationCanvasPoints - The canvas points of the annotation's handles.
 * @param element - Viewport HTML element used to clamp textbox placement.
 * @param textLines - Text content used to estimate textbox size before rendering.
 * @returns - The coordinates for default placement of the textbox.
 */
export default function getTextBoxCoordsCanvas(
  annotationCanvasPoints: Array<Types.Point2>,
  element?: HTMLDivElement,
  textLines: Array<string> = []
): Types.Point2 {
  if (!annotationCanvasPoints?.length || !annotationCanvasPoints[0]) {
    return <Types.Point2>[0, 0];
  }
  const corners = _determineCorners(annotationCanvasPoints);
  const centerY = (corners.top[1] + corners.bottom[1]) / 2;
  const defaultTextBoxCanvas = <Types.Point2>[corners.right[0], centerY];

  if (!element) {
    return defaultTextBoxCanvas;
  }

  const { width: textBoxWidth, height: textBoxHeight } =
    _estimateTextBoxSize(textLines);
  const margin = 4;
  const maxX = element.clientWidth - margin;
  const maxY = element.clientHeight - margin;
  let x = corners.right[0];
  let y = centerY - textBoxHeight / 2;

  if (x + textBoxWidth > maxX) {
    x = corners.left[0] - textBoxWidth;
  }

  x = Math.max(margin, Math.min(x, maxX - textBoxWidth));
  y = Math.max(margin, Math.min(y, maxY - textBoxHeight));

  // Overlap avoidance
  const svgLayer = _findSvgLayer(element);
  if (svgLayer) {
    const existingBoxes = getRegisteredTextBoxes(svgLayer);
    if (existingBoxes.length > 0) {
      const resolved = _resolveOverlap(
        x,
        y,
        textBoxWidth,
        textBoxHeight,
        existingBoxes,
        margin,
        maxX,
        maxY
      );
      x = resolved[0];
      y = resolved[1];
    }
  }

  return <Types.Point2>[x, y];
}

/**
 * If the proposed rectangle overlaps any existing text box, try to nudge it
 * vertically (downward first, then upward) until a clear slot is found.  Falls
 * back to the original position when the viewport is too crowded.
 */
function _resolveOverlap(
  x: number,
  y: number,
  width: number,
  height: number,
  existingBoxes: TextBoxRect[],
  margin: number,
  maxX: number,
  maxY: number
): Types.Point2 {
  if (!_overlapsAny(x, y, width, height, existingBoxes)) {
    return <Types.Point2>[x, y];
  }

  // scan downward – push below each overlapping box in turn.
  let candidateY = y;
  for (let i = 0; i < 30; i++) {
    const blocker = _findFirstOverlap(
      x,
      candidateY,
      width,
      height,
      existingBoxes
    );
    if (!blocker) {
      break;
    }
    candidateY = blocker.y + blocker.height + TEXT_BOX_GAP;
    if (candidateY + height > maxY) {
      candidateY = Infinity;
      break;
    }
  }
  if (
    candidateY !== Infinity &&
    !_overlapsAny(x, candidateY, width, height, existingBoxes)
  ) {
    return <Types.Point2>[
      x,
      Math.max(margin, Math.min(candidateY, maxY - height)),
    ];
  }

  // Strategy 2: scan upward – push above each overlapping box in turn.
  candidateY = y;
  for (let i = 0; i < 30; i++) {
    const blocker = _findFirstOverlap(
      x,
      candidateY,
      width,
      height,
      existingBoxes
    );
    if (!blocker) {
      break;
    }
    candidateY = blocker.y - height - TEXT_BOX_GAP;
    if (candidateY < margin) {
      candidateY = -Infinity;
      break;
    }
  }
  if (
    candidateY !== -Infinity &&
    !_overlapsAny(x, candidateY, width, height, existingBoxes)
  ) {
    return <Types.Point2>[
      x,
      Math.max(margin, Math.min(candidateY, maxY - height)),
    ];
  }

  // All vertical slots exhausted – return the original position.
  return <Types.Point2>[x, y];
}

/**
 * Returns `true` when the candidate rectangle intersects (or nearly touches)
 * any rectangle in `boxes`.
 */
function _overlapsAny(
  x: number,
  y: number,
  w: number,
  h: number,
  boxes: TextBoxRect[]
): boolean {
  const candidate = _toTextBoxAABB({ x, y, width: w, height: h });

  return boxes.some((box) =>
    intersectAABB(candidate, _toTextBoxAABB(box, TEXT_BOX_GAP / 2))
  );
}

/**
 * Returns the first existing box that overlaps the candidate, or `undefined`.
 */
function _findFirstOverlap(
  x: number,
  y: number,
  w: number,
  h: number,
  boxes: TextBoxRect[]
): TextBoxRect | undefined {
  const candidate = _toTextBoxAABB({ x, y, width: w, height: h });

  return boxes.find((box) =>
    intersectAABB(candidate, _toTextBoxAABB(box, TEXT_BOX_GAP / 2))
  );
}

function _toTextBoxAABB(rect: TextBoxRect, inflate = 0): Types.AABB2 {
  return {
    minX: rect.x - inflate,
    minY: rect.y - inflate,
    maxX: rect.x + rect.width + inflate,
    maxY: rect.y + rect.height + inflate,
  };
}

/**
 * Locate the SVG drawing layer for a viewport element.
 * Mirrors the lookup in getSvgDrawingHelper.ts.
 */
function _findSvgLayer(element: HTMLDivElement): Element | null {
  const internalDiv = element.querySelector(`.${VIEWPORT_ELEMENT}`);
  return internalDiv?.querySelector(':scope > .svg-layer') || null;
}

/**
 * Determine the handles that have the min/max x and y values.
 * Handles single-point annotations (e.g. Probe): left/right/top/bottom all equal that point.
 */
function _determineCorners(canvasPoints: Array<Types.Point2>) {
  const p0 = canvasPoints[0];
  if (!p0 || canvasPoints.length < 2) {
    return { left: p0, right: p0, top: p0, bottom: p0 };
  }
  const handlesLeftToRight = [canvasPoints[0], canvasPoints[1]].sort(_compareX);
  const handlesTopToBottom = [canvasPoints[0], canvasPoints[1]].sort(_compareY);
  const left = handlesLeftToRight[0];
  const right = handlesLeftToRight[handlesLeftToRight.length - 1];
  const top = handlesTopToBottom[0];
  const bottom = handlesTopToBottom[handlesTopToBottom.length - 1];

  return {
    left,
    top,
    bottom,
    right,
  };

  function _compareX(a, b) {
    return a[0] < b[0] ? -1 : 1;
  }
  function _compareY(a, b) {
    return a[1] < b[1] ? -1 : 1;
  }
}

/**
 * We estimate dimensions here (instead of measuring a rendered SVG bbox)
 * because this utility runs before drawing occurs and should stay a pure
 * placement helper shared by many tools.
 *
 * These constants intentionally mirror `drawTextBox` defaults:
 * - padding follows drawingSvg/drawTextBox.ts default (25px)
 * - line height approximates 14px font with 1.2em tspans
 * - average character width uses a conservative value for Helvetica/Arial
 *
 * Result: a stable pre-draw placement that prevents corner overflow without
 * requiring a two-pass draw/measure/redraw cycle in each tool.
 */
function _estimateTextBoxSize(textLines: Array<string>) {
  const estimatedPadding = 25;
  const estimatedCharWidth = 8;
  const estimatedLineHeight = 17;
  const longestLineLength = textLines.reduce(
    (max, line) => Math.max(max, line?.length ?? 0),
    0
  );
  const lineCount = Math.max(textLines.length, 1);
  const width = longestLineLength * estimatedCharWidth + estimatedPadding * 2;
  const height = lineCount * estimatedLineHeight + estimatedPadding * 2;

  return { width, height };
}
