/**
 * Voxel-relative annotation statistics: which voxels an area annotation
 * contains, and which annotations a viewport displays.
 *
 * The behaviour these utilities implement is specified in
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889 and in
 * `docs/docs/concepts/annotations/voxel-statistics.md`. Rule M (voxel
 * membership) and Rule D (display) are normative; the index-space run
 * arithmetic used to evaluate Rule M quickly is an implementation detail and
 * may be changed freely so long as it selects the same voxels.
 */
export { default as getVoxelThicknessAlongNormal } from './getVoxelThicknessAlongNormal';

export {
  SLAB_RELATIVE_EPSILON,
  getSlabEpsilon,
  resolveAnnotationThickness,
  getMembershipHalfWidth,
  getDisplayHalfWidth,
  signedDistanceToPlane,
  isWithinSlab,
  isVoxelCenterInSlab,
  projectPointOntoPlane,
  asUnitNormal,
} from './slabMembership';

export {
  getIndexSpaceNormal,
  pickOuterAxis,
  buildIndexSpaceSlab,
  depthAtIndex,
  getDepthRun,
  getSlabAxisBound,
} from './indexSpaceSlab';
export type { IndexSpaceSlab, VolumeGeometry } from './indexSpaceSlab';

export { isPlaneDepthViewable } from './isPlaneDepthViewable';

export {
  iterateVoxelsInSlab,
  collectVoxelsInSlab,
} from './iterateVoxelsInSlab';
export type {
  VoxelSlabVisit,
  ShapeRunProvider,
  VoxelSlabIterationOptions,
} from './iterateVoxelsInSlab';
