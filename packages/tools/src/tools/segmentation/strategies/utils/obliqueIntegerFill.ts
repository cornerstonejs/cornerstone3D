import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';

const {
  obliqueIntegerIterator: oii,
  transformIndexToWorld,
  transformWorldToIndex,
} = csUtils;

const {
  createObliqueIntegerBasis,
  forEachObliqueVoxel,
  ellipsoidUVWFromIndexQuadratic,
  sphereIndexQuadratic,
  getWRangeForUVWEllipsoid,
  getURangeForW,
  getVRangeForWU,
  uvwFromIJK,
  intersectRange,
  isRangeEmpty,
} = oii;

/** Inclusive integer range (mirrors core {@link obliqueIntegerIterator.IntRange}). */
interface IntRange {
  min: number;
  max: number;
}

type ObliqueIntegerBasis = ReturnType<typeof createObliqueIntegerBasis>;

interface ObliqueEllipsoidUVW {
  H: number[];
  q0: Types.Point3;
}

interface ObliqueVoxelVisit {
  ijk: Types.Point3;
  u: number;
  v: number;
  w: number;
}

/**
 * Descriptor attached to {@link InitializedOperationData} when the fill should
 * enumerate voxels via the integer oblique iterator instead of the axis-aligned
 * IJK bounding box.
 */
export interface ObliqueIntegerFillDescriptor {
  basis: ObliqueIntegerBasis;
  dimensions: Types.Point3;
  wRange?: IntRange;
  getURangeForW?: (w: number) => IntRange;
  getVRangeForWU?: (w: number, u: number) => IntRange;
  /**
   * Optional final predicate for shapes that are not yet expressed as exact
   * `(u, v, w)` ranges. Kept minimal so it can be removed later.
   */
  predicate?: (visit: ObliqueVoxelVisit) => boolean;
}

function volumeGeometryFromImageData(imageData: vtkImageData) {
  return {
    dimensions: imageData.getDimensions() as Types.Point3,
    direction: imageData.getDirection(),
    spacing: imageData.getSpacing() as Types.Point3,
  };
}

function viewAxesFromOperationData(operationData: {
  viewUp: Types.Point3;
  viewPlaneNormal: Types.Point3;
}): { viewRight: Types.Point3; viewUp: Types.Point3 } {
  const viewUp = vec3.normalize(vec3.create(), operationData.viewUp as vec3);
  const viewRight = vec3.cross(
    vec3.create(),
    viewUp,
    operationData.viewPlaneNormal as vec3
  );
  vec3.normalize(viewRight, viewRight);
  return {
    viewRight: viewRight as Types.Point3,
    viewUp: viewUp as Types.Point3,
  };
}

function worldLengthPerLatticeStep(
  direction: mat3 | number[] | Float32Array,
  spacing: Types.Point3,
  step: Types.Point3
): number {
  const iVec = direction.slice(0, 3) as Types.Point3;
  const jVec = direction.slice(3, 6) as Types.Point3;
  const kVec = direction.slice(6, 9) as Types.Point3;
  const world = [
    (iVec[0] * step[0] + jVec[0] * step[1] + kVec[0] * step[2]) * spacing[0],
    (iVec[1] * step[0] + jVec[1] * step[1] + kVec[1] * step[2]) * spacing[1],
    (iVec[2] * step[0] + jVec[2] * step[1] + kVec[2] * step[2]) * spacing[2],
  ] as Types.Point3;
  return vec3.length(world as vec3);
}

/**
 * Builds a thin-slab ellipsoid in `(u, v, w)` lattice coordinates for a planar
 * ellipse aligned with the viewport axes.
 */
function planarEllipseEllipsoidUVW(
  basis: ObliqueIntegerBasis,
  centerIJK: Types.Point3,
  radiusU: number,
  radiusV: number,
  slabHalfWidth = 0.5
): ObliqueEllipsoidUVW {
  const q0 = uvwFromIJK(centerIJK, basis);
  const H = [
    1 / (radiusU * radiusU),
    0,
    0,
    0,
    1 / (radiusV * radiusV),
    0,
    0,
    0,
    1 / (slabHalfWidth * slabHalfWidth),
  ];
  return { H, q0 };
}

/**
 * Integer oblique fill descriptor for a planar circle / ellipse brush.
 */
export function createCircleObliqueIntegerFill(operationData: {
  viewUp: Types.Point3;
  viewPlaneNormal: Types.Point3;
  centerIJK: Types.Point3;
  segmentationImageData: vtkImageData;
  xRadius: number;
  yRadius: number;
}): ObliqueIntegerFillDescriptor {
  const { segmentationImageData, centerIJK, xRadius, yRadius } = operationData;
  const { dimensions, direction, spacing } = volumeGeometryFromImageData(
    segmentationImageData
  );
  const { viewRight, viewUp } = viewAxesFromOperationData(operationData);

  const basis = createObliqueIntegerBasis({
    dimensions,
    direction,
    spacing,
    viewPlaneNormal: operationData.viewPlaneNormal,
    viewUp,
    viewRight,
  });

  const uScale = worldLengthPerLatticeStep(direction, spacing, basis.A);
  const vScale = worldLengthPerLatticeStep(direction, spacing, basis.B);
  const radiusU = Math.max(xRadius / uScale, 1);
  const radiusV = Math.max(yRadius / vScale, 1);

  const ellipsoid = planarEllipseEllipsoidUVW(
    basis,
    centerIJK,
    radiusU,
    radiusV
  );
  const wRange = getWRangeForUVWEllipsoid(ellipsoid);

  return {
    basis,
    dimensions,
    wRange,
    getURangeForW: (w) => getURangeForW(ellipsoid, w),
    getVRangeForWU: (w, u) => getVRangeForWU(ellipsoid, w, u),
  };
}

/**
 * Integer oblique fill descriptor for a volumetric sphere brush.
 */
export function createSphereObliqueIntegerFill(operationData: {
  viewUp: Types.Point3;
  viewPlaneNormal: Types.Point3;
  centerIJK: Types.Point3;
  segmentationImageData: vtkImageData;
  radiusWorld: number;
}): ObliqueIntegerFillDescriptor {
  const { segmentationImageData, centerIJK, radiusWorld } = operationData;
  const { dimensions, direction, spacing } = volumeGeometryFromImageData(
    segmentationImageData
  );
  const { viewRight, viewUp } = viewAxesFromOperationData(operationData);

  const basis = createObliqueIntegerBasis({
    dimensions,
    direction,
    spacing,
    viewPlaneNormal: operationData.viewPlaneNormal,
    viewUp,
    viewRight,
  });

  const Q = sphereIndexQuadratic(direction, spacing, radiusWorld);
  const ellipsoid = ellipsoidUVWFromIndexQuadratic(Q, centerIJK, basis);
  const wRange = getWRangeForUVWEllipsoid(ellipsoid);

  return {
    basis,
    dimensions,
    wRange,
    getURangeForW: (w) => getURangeForW(ellipsoid, w),
    getVRangeForWU: (w, u) => getVRangeForWU(ellipsoid, w, u),
  };
}

/**
 * Integer oblique fill descriptor for a viewport-aligned rectangle brush.
 *
 * Traversal uses the integer oblique basis for deterministic plane ownership.
 * Inclusion is tested in world space with the rectangle's in-plane axes so the
 * fill matches the screen/view rectangle.
 */
export function createRectangleObliqueIntegerFill(operationData: {
  viewUp: Types.Point3;
  viewPlaneNormal: Types.Point3;
  centerIJK: Types.Point3;
  segmentationImageData: vtkImageData;
  cornersWorld: Types.Point3[];
}): ObliqueIntegerFillDescriptor {
  const { segmentationImageData, centerIJK, cornersWorld } = operationData;
  const { dimensions, direction, spacing } = volumeGeometryFromImageData(
    segmentationImageData
  );
  const { viewRight, viewUp } = viewAxesFromOperationData(operationData);

  const basis = createObliqueIntegerBasis({
    dimensions,
    direction,
    spacing,
    viewPlaneNormal: operationData.viewPlaneNormal,
    viewUp,
    viewRight,
  });

  const [p0, p1, , p3] = cornersWorld;
  const axisU = vec3.subtract(vec3.create(), p1, p0);
  const axisV = vec3.subtract(vec3.create(), p3, p0);
  const uLen = vec3.length(axisU);
  const vLen = vec3.length(axisV);
  vec3.normalize(axisU, axisU);
  vec3.normalize(axisV, axisV);

  const normal = vec3.cross(vec3.create(), axisU, axisV);
  vec3.normalize(normal, normal);

  const projectedSpacing = csUtils.getSpacingInNormalDirection(
    { direction, spacing },
    normal as Types.Point3
  );
  const thickness = projectedSpacing;
  const inPlaneTolerance = Math.min(spacing[0], spacing[1]) / 2;

  const cornersIJK = cornersWorld.map((world) =>
    transformWorldToIndex(segmentationImageData, world)
  );
  const uvwCorners = cornersIJK.map((ijk) => uvwFromIJK(ijk, basis));

  const uVals = uvwCorners.map((q) => q[0]);
  const vVals = uvwCorners.map((q) => q[1]);
  const uRange: IntRange = {
    min: Math.floor(Math.min(...uVals)),
    max: Math.ceil(Math.max(...uVals)),
  };
  const vRange: IntRange = {
    min: Math.floor(Math.min(...vVals)),
    max: Math.ceil(Math.max(...vVals)),
  };

  const q0 = uvwFromIJK(centerIJK, basis);
  const wCenter = Math.round(q0[2]);
  const wRange: IntRange = { min: wCenter, max: wCenter };

  const predicate = ({ ijk }: ObliqueVoxelVisit) => {
    const world = transformIndexToWorld(
      segmentationImageData,
      ijk
    ) as Types.Point3;
    const v = vec3.subtract(vec3.create(), world, p0);
    const u = vec3.dot(v, axisU);
    const vproj = vec3.dot(v, axisV);
    const distanceToPlane = Math.abs(vec3.dot(v, normal));
    return (
      u >= -inPlaneTolerance &&
      u <= uLen + inPlaneTolerance &&
      vproj >= -inPlaneTolerance &&
      vproj <= vLen + inPlaneTolerance &&
      distanceToPlane <= thickness
    );
  };

  return {
    basis,
    dimensions,
    wRange,
    getURangeForW: () => uRange,
    getVRangeForWU: () => vRange,
    predicate,
  };
}

/**
 * Enumerates voxels via the integer oblique iterator and invokes `callback` for
 * each owned voxel, matching the `VoxelManager.forEach` callback shape.
 */
export function forEachObliqueIntegerFillVoxel(
  descriptor: ObliqueIntegerFillDescriptor,
  voxelManager: Types.IVoxelManager<number>,
  callback: (args: {
    value: number;
    index: number;
    pointIJK: Types.Point3;
    pointLPS: Types.Point3;
  }) => void,
  imageData: vtkImageData
): void {
  forEachObliqueVoxel(descriptor.basis, {
    wRange: descriptor.wRange,
    getURangeForW: descriptor.getURangeForW,
    getVRangeForWU: descriptor.getVRangeForWU,
    dimensions: descriptor.dimensions,
    predicate: descriptor.predicate,
    visit: ({ ijk }) => {
      const index = voxelManager.toIndex(ijk);
      const value = voxelManager.getAtIndex(index);
      const pointLPS = transformIndexToWorld(imageData, ijk) as Types.Point3;
      callback({ value, index, pointIJK: ijk, pointLPS });
    },
  });
}

/**
 * Returns whether a descriptor's ranges are non-empty (quick guard).
 */
export function isObliqueIntegerFillNonEmpty(
  descriptor: ObliqueIntegerFillDescriptor
): boolean {
  const wRange = descriptor.wRange
    ? intersectRange(descriptor.basis.wRange, descriptor.wRange)
    : descriptor.basis.wRange;
  return !isRangeEmpty(wRange);
}
