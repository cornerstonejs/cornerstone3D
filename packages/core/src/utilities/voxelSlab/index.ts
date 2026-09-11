/**
 * Voxel-relative annotation statistics: which voxels an area annotation
 * contains, and which annotations a viewport displays.
 *
 * Rule M (voxel membership) and Rule D (display) are normative. Rule F, which
 * `getFillHalfWidth` gives, is what a brush fill uses instead of Rule M: a fill
 * writes the voxels it passes through, and a measurement includes the voxels
 * that touch the plane. See
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md` and
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889.
 */
export { default as getVoxelThicknessAlongNormal } from './getVoxelThicknessAlongNormal';

export {
  SLAB_RELATIVE_EPSILON,
  getSlabEpsilon,
  resolveReferencePlaneThickness,
  getMembershipHalfWidth,
  getFillHalfWidth,
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
  iterateVoxelsInShape,
  collectVoxelsInShape,
} from './iterateVoxelsInShape';
export type {
  VoxelInShape,
  ShapeRunProvider,
  VoxelsInShapeOptions,
} from './iterateVoxelsInShape';

export { sampleVoxelsInShape } from './sampleVoxelsInShape';
export type {
  VoxelSample,
  VoxelsInShapeSamplingOptions,
  VoxelValueSource,
} from './sampleVoxelsInShape';

export * from './shapes';
