/**
 * Plane-anchored shapes that drive `iterateVoxelsInSlab`.
 *
 * Each shape provides a `containsPoint` definition and an exact `getRuns`
 * closed form, and the two must select the same voxels. For a worked example,
 * see `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
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
