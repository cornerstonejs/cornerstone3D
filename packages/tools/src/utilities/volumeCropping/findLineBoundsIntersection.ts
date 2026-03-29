import { vec2, vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import liangBarksyClip from '../math/vec2/liangBarksyClip';
import { LINE_EXTENSION_DISTANCE, MIN_LINE_LENGTH_PIXELS } from './constants';

/**
 * Finds where an intersection line crosses the viewport bounds.
 * Returns two points on the line that are within the viewport bounds.
 *
 * @param linePoint - A point on the line
 * @param lineDirection - The direction vector of the line
 * @param viewport - The viewport to check bounds against
 * @returns Object with start and end points in canvas coordinates, or null if line doesn't intersect
 */
export function findLineBoundsIntersection(
  linePoint: Types.Point3,
  lineDirection: Types.Point3,
  viewport: Types.IViewport
): { start: Types.Point2; end: Types.Point2 } | null {
  const lineLength = LINE_EXTENSION_DISTANCE;
  const lineStart = vec3.scaleAndAdd(
    [0, 0, 0],
    linePoint,
    lineDirection,
    -lineLength
  ) as Types.Point3;
  const lineEnd = vec3.scaleAndAdd(
    [0, 0, 0],
    linePoint,
    lineDirection,
    lineLength
  ) as Types.Point3;

  const canvasStart = viewport.worldToCanvas(lineStart);
  const canvasEnd = viewport.worldToCanvas(lineEnd);

  // Get viewport dimensions
  const { clientWidth, clientHeight } = viewport.canvas;

  // Clip to canvas bounds
  const canvasBox = [0, 0, clientWidth, clientHeight];
  const clippedStart = vec2.clone(canvasStart);
  const clippedEnd = vec2.clone(canvasEnd);

  // Check if line is valid before clipping
  const startValid = !isNaN(clippedStart[0]) && !isNaN(clippedStart[1]);
  const endValid = !isNaN(clippedEnd[0]) && !isNaN(clippedEnd[1]);
  if (!startValid || !endValid) {
    return null;
  }

  const clipResult = liangBarksyClip(clippedStart, clippedEnd, canvasBox);

  // Check if line actually intersects the viewport bounds
  // liangBarksyClip returns 1 (INSIDE) if line intersects, 0 (OUTSIDE) if it doesn't
  if (clipResult === 0) {
    return null;
  }

  // Check if clipped line is still valid
  const clippedStartValid = !isNaN(clippedStart[0]) && !isNaN(clippedStart[1]);
  const clippedEndValid = !isNaN(clippedEnd[0]) && !isNaN(clippedEnd[1]);
  if (!clippedStartValid || !clippedEndValid) {
    return null;
  }

  // Verify that clipped coordinates are actually within the viewport bounds
  const [xMin, yMin, xMax, yMax] = canvasBox;
  const startInBounds =
    clippedStart[0] >= xMin - 1 &&
    clippedStart[0] <= xMax + 1 &&
    clippedStart[1] >= yMin - 1 &&
    clippedStart[1] <= yMax + 1;
  const endInBounds =
    clippedEnd[0] >= xMin - 1 &&
    clippedEnd[0] <= xMax + 1 &&
    clippedEnd[1] >= yMin - 1 &&
    clippedEnd[1] <= yMax + 1;

  if (!startInBounds || !endInBounds) {
    return null;
  }

  // Check if the line has zero length after clipping
  const dx = clippedEnd[0] - clippedStart[0];
  const dy = clippedEnd[1] - clippedStart[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < MIN_LINE_LENGTH_PIXELS) {
    return null; // Line is too short to draw
  }

  return {
    start: clippedStart as Types.Point2,
    end: clippedEnd as Types.Point2,
  };
}
