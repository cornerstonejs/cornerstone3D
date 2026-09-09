/**
 * Voxel-relative annotation statistics: which voxels an area annotation
 * contains, and which annotations a viewport displays.
 *
 * Rule M (voxel membership) and Rule D (display) are normative, and both are
 * specified in
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md` and in
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889. The index-space
 * run arithmetic that evaluates Rule M quickly is an implementation detail, and
 * anyone may change it as long as it selects the same voxels.
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

export * from './shapes';
