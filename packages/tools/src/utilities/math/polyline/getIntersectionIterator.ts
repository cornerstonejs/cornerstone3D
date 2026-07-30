import type { Types } from '@cornerstonejs/core';
import getAABB from './getAABB';
import getLineSegmentIntersectionsCoordinates from './getLineSegmentIntersectionsCoordinates';

/**
 * A 2D canvas-space scanline rasterizer that identifies all screen pixels
 * residing inside a closed hand-drawn ROI polygon.
 * @param canvasCoordinates - An array of 2D points `[x, y]` defining the boundary of the drawn ROI.
 * @param canvasStep - Canvas-space step between sample points. Use a value less than 1 when
 * zoomed out so adjacent samples stay within one voxel in index space.
 * @returns A generator that yields individual `[cx, cy]` canvas pixel coordinates located inside the ROI.
 */
function* getIntersectionIterator(canvasCoordinates, canvasStep = 1) {
  const {
    maxX: canvasMaxX,
    maxY: canvasMaxY,
    minX: canvasMinX,
    minY: canvasMinY,
  } = getAABB(canvasCoordinates);

  const startX = Math.floor(canvasMinX);
  const endX = Math.ceil(canvasMaxX);
  const startY = Math.floor(canvasMinY);
  const endY = Math.ceil(canvasMaxY);

  const canvasMaxXPadded = endX + 1;
  const EPSILON = 1e-6; // Tolerance for floating-point coordinate comparisons

  for (let cy = startY; cy <= endY; cy += canvasStep) {
    // Compute all intersections of the polygon with this scanline row
    const intersections = getLineSegmentIntersectionsCoordinates(
      canvasCoordinates,
      [startX - 1, cy] as Types.Point2,
      [canvasMaxXPadded, cy] as Types.Point2
    );

    if (!intersections || intersections.length === 0) {
      continue;
    }

    // Sort intersections by X coordinate
    intersections.sort((a, b) => a[0] - b[0]);

    // Deduplicate intersections at vertices/tangents to preserve even/odd parity
    const uniqueIntersections: Types.Point2[] = [];
    for (const pt of intersections) {
      if (
        uniqueIntersections.length === 0 ||
        Math.abs(
          pt[0] - uniqueIntersections[uniqueIntersections.length - 1][0]
        ) > EPSILON
      ) {
        uniqueIntersections.push(pt);
      } else {
        // If it's a duplicate X on the same scanline, it's a vertex intersection.
        // For a classic even-odd fill, touching a vertex counts as 1 transition if it crosses,
        // or 0 transitions if it's a peak/tangent. By popping it here, we handle the tangent case.
        uniqueIntersections.pop();
      }
    }

    // Walk through valid intersection pairs (entry/exit)
    for (let i = 0; i + 1 < uniqueIntersections.length; i += 2) {
      const xEnter = uniqueIntersections[i][0];
      const xExit = uniqueIntersections[i + 1][0];
      const firstX = Math.ceil(xEnter / canvasStep) * canvasStep;
      const lastX = Math.floor(xExit / canvasStep) * canvasStep;

      for (let cx = firstX; cx <= lastX; cx += canvasStep) {
        yield [cx, cy];
      }
    }
  }
}

export default getIntersectionIterator;
