import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import liangBarksyClip from '../math/vec2/liangBarksyClip';
import getDisplayedCanvasSize from './getDisplayedCanvasSize';
import type { WorldLine } from './types';

/** Canvas segments shorter than this are treated as degenerate. */
const MIN_SEGMENT_LENGTH = 1e-3;

/**
 * Clips an infinite world-space line to the visible canvas of a viewport.
 *
 * A sufficiently long segment of the line (centered on the point of the line
 * closest to the viewport center, to stay numerically well-behaved) is
 * converted to canvas space and clipped against the canvas bounds.
 *
 * Returns the two clipped canvas endpoints, or null when the line does not
 * intersect the visible canvas (including the degenerate case where the line
 * projects to a single canvas point, e.g. a line perpendicular to the view
 * plane).
 */
export default function clipWorldLineToViewportCanvas(
  line: WorldLine,
  viewport: Types.IVolumeViewport | Types.IViewport
): [Types.Point2, Types.Point2] | null {
  if (!line || !viewport) {
    return null;
  }

  const { clientWidth, clientHeight } = getDisplayedCanvasSize(viewport);
  if (!clientWidth || !clientHeight) {
    return null;
  }

  const direction = vec3.normalize(vec3.create(), line.direction);
  if (vec3.length(direction) < 1e-10) {
    return null;
  }

  // Re-anchor the line on the point closest to the viewport center so the
  // projected segment endpoints stay near the canvas even when line.point is
  // far away in world space.
  const centerWorld = viewport.canvasToWorld([
    clientWidth / 2,
    clientHeight / 2,
  ]);
  const toCenter = vec3.subtract(vec3.create(), centerWorld, line.point);
  const projectedLength = vec3.dot(toCenter, direction);
  const anchor = vec3.scaleAndAdd(
    vec3.create(),
    line.point as Types.Point3,
    direction,
    projectedLength
  );

  // Half-length that comfortably covers the canvas: twice the world-space
  // distance between the canvas center and a canvas corner.
  const cornerWorld = viewport.canvasToWorld([0, 0]);
  const halfDiagonalWorld = vec3.distance(centerWorld, cornerWorld);
  const halfLength = Math.max(halfDiagonalWorld * 2, 1);

  const startWorld = vec3.scaleAndAdd(
    vec3.create(),
    anchor,
    direction,
    -halfLength
  );
  const endWorld = vec3.scaleAndAdd(
    vec3.create(),
    anchor,
    direction,
    halfLength
  );

  const startCanvas = viewport.worldToCanvas([
    startWorld[0],
    startWorld[1],
    startWorld[2],
  ]);
  const endCanvas = viewport.worldToCanvas([
    endWorld[0],
    endWorld[1],
    endWorld[2],
  ]);

  if (
    ![...startCanvas, ...endCanvas].every((component) =>
      Number.isFinite(component)
    )
  ) {
    return null;
  }

  const clippedStart: Types.Point2 = [startCanvas[0], startCanvas[1]];
  const clippedEnd: Types.Point2 = [endCanvas[0], endCanvas[1]];

  const inside = liangBarksyClip(clippedStart, clippedEnd, [
    0,
    0,
    clientWidth,
    clientHeight,
  ]);

  if (inside !== 1) {
    return null;
  }

  const segmentLength = Math.hypot(
    clippedEnd[0] - clippedStart[0],
    clippedEnd[1] - clippedStart[1]
  );

  if (segmentLength < MIN_SEGMENT_LENGTH) {
    return null;
  }

  return [clippedStart, clippedEnd];
}
