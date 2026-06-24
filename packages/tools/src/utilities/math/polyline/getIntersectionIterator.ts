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

    // Walk through intersection pairs (entry/exit)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const xEnter = intersections[i][0];
      const xExit = intersections[i + 1][0];
      const firstX = Math.ceil(xEnter / canvasStep) * canvasStep;
      const lastX = Math.floor(xExit / canvasStep) * canvasStep;

      for (let cx = firstX; cx <= lastX; cx += canvasStep) {
        yield [cx, cy];
      }
    }
  }
}

export default getIntersectionIterator;
