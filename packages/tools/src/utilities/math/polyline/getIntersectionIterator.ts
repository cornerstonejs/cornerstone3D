import getScanlineIntersections from './getScanlineIntersections';
import getAABB from './getAABB';

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

  for (let cy = startY; cy <= endY; cy += canvasStep) {
    // Compute all intersections of the polygon with horizontal scanline row
    const intersections = getScanlineIntersections(
      canvasCoordinates,
      cy,
      startX - 1,
      endX + 1
    );

    if (!intersections || intersections.length === 0) {
      continue;
    }

    // Walk through valid intersection pairs (entry/exit)
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
