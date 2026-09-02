/**
 * Plane-anchored shapes that drive `iterateVoxelsInSlab`.
 *
 * Each shape provides a `containsPoint` definition and an exact `getRuns`
 * closed form which must select the same voxels. See `VoxelSlabShape`.
 *
 * Handing a shape to the iterator:
 *
 * ```ts
 * const shape = createEllipseShape({ volume, planePoint, normal, center,
 *   majorAxis, majorRadius, minorRadius });
 *
 * for (const { ijk, center } of iterateVoxelsInSlab({
 *   volume,
 *   planePoint,
 *   normal,
 *   annotationThickness: shape.getRequiredThickness() || annotationThickness,
 *   getShapeRuns: shape.getRuns,
 * })) {
 *   // accumulate statistics
 * }
 * ```
 *
 * Swap `getShapeRuns: shape.getRuns` for `isInShape: shape.containsPoint` and
 * the result must be identical, only slower. That equivalence is what the tests
 * assert, and it is the cheapest way to debug a suspect shape.
 */
export type {
  VoxelSlabShape,
  PlaneBasis,
  ColumnLine,
  RealRange,
} from './shapeGeometry';

export {
  createPlaneBasis,
  createColumnLineResolver,
  getAxisSteps,
  intersectRanges,
  solveAbsLinearLeq,
  solveQuadraticLeqZero,
  toIntegerRun,
  UNBOUNDED,
} from './shapeGeometry';

export { createEllipseShape, createCircleShape } from './createEllipseShape';
export type { EllipseShapeOptions } from './createEllipseShape';

export { createRectangleShape } from './createRectangleShape';
export type { RectangleShapeOptions } from './createRectangleShape';

export { createContourShape } from './createContourShape';
export type { ContourShapeOptions } from './createContourShape';
