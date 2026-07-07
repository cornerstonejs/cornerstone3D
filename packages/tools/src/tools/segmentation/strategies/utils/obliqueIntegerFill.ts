/**
 * Integer oblique segmentation fills.
 *
 * These builders describe a brush shape (circle/ellipse, sphere, rectangle) as
 * ranges in the unimodular integer lattice `(u, v, w)` of an oblique plane (see
 * `core` `obliqueIntegerIterator`). The fill enumerates voxels plane-by-plane in
 * `w`, then `u`, then `v`, using exact integer ranges so it is fast and never
 * visits a voxel twice.
 *
 * ## View slab thickness (behavioural description)
 *
 * A circle/ellipse brush is a flat disc on the oblique view plane extruded a
 * little way along the view normal - an elliptical *cylinder*. The slab
 * half-thickness (along the normal) controls how deep that cylinder is:
 *
 * - **Thin (single-slice) view** - the default. The slab half-width is floored
 *   at the watertight minimum (~half a voxel measured *along the normal*, i.e.
 *   half the voxel's city-block projection onto it). This is the thinnest slab
 *   that still reads as a solid disc in the oblique view: a thinner slab grazes
 *   the integer lattice at sparse positions and shows up as spaced lines / holes.
 * - **Full-thickness (thick-slab) view** - the slab half-width comes from the
 *   view slab thickness, so the cylinder is deep. A "circular" fill then becomes
 *   a short cylinder (a *volume* fill) and paints all voxels through the depth.
 *
 * Note the disc is oblique, so even a one-voxel-thick fill generally intersects
 * several integer `w` planes; the descriptor's `w` range is the lattice bounding
 * box that the fill's membership predicate then trims to the exact cylinder - it
 * is not a count of painted planes.
 *
 * ## Area semantics for thick-slab fills
 *
 * A thin fill is ~one voxel deep, so its in-plane area is simply the painted
 * voxel count x voxelArea. A thick-slab fill is a volume, not a planar region:
 * any *area* computation over its voxels must divide by the through-normal depth
 * (in voxels) so the extra layers do not over-count the area. This only matters
 * for area-based measurements; freeform fills that compute no area are unaffected.
 */
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
  /**
   * The inclusive `w` (through-plane) range of oblique planes to fill. A range
   * spanning a single `w` is a planar fill; a range spanning several `w` planes
   * is a volume (thick-slab) fill. See the module behavioural description for the
   * area semantics: area computations must divide each voxel's area by the number
   * of `w` planes (`wRange.max - wRange.min + 1`).
   */
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

/** Row-major voxel-to-world matrix `M` (world = M * ijk); columns are the volume
 * direction axes scaled by voxel spacing. */
function buildVoxelToWorld(
  direction: mat3 | number[] | Float32Array,
  spacing: Types.Point3
): number[] {
  const i = direction.slice(0, 3) as Types.Point3;
  const j = direction.slice(3, 6) as Types.Point3;
  const k = direction.slice(6, 9) as Types.Point3;
  return [
    i[0] * spacing[0],
    j[0] * spacing[1],
    k[0] * spacing[2],
    i[1] * spacing[0],
    j[1] * spacing[1],
    k[1] * spacing[2],
    i[2] * spacing[0],
    j[2] * spacing[1],
    k[2] * spacing[2],
  ];
}

function dot3(a: Types.Point3, b: Types.Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The three columns of a row-major 3x3 matrix (voxel-to-world axes). */
function columns3x3(m: number[]): [Types.Point3, Types.Point3, Types.Point3] {
  return [
    [m[0], m[3], m[6]] as Types.Point3,
    [m[1], m[4], m[7]] as Types.Point3,
    [m[2], m[5], m[8]] as Types.Point3,
  ];
}

/**
 * Minimum world half-thickness (along `viewPlaneNormal`) for the fill slab to be
 * watertight when viewed along that normal: half the city-block projection of a
 * single voxel onto the normal, `0.5 · Σ |normal · (axisᵢ · spacingᵢ)|`.
 *
 * A thinner slab grazes the integer lattice at sparse in-plane positions, which
 * shows up as spaced lines / holes on a steep oblique plane; this floor
 * guarantees every view ray through the disc hits at least one filled voxel.
 */
function minSlabHalfWorld(M: number[], viewPlaneNormal: Types.Point3): number {
  const cols = columns3x3(M);
  return (
    0.5 * cols.reduce((sum, c) => sum + Math.abs(dot3(c, viewPlaneNormal)), 0)
  );
}

/**
 * Samples extra world centers along a stroke polyline so consecutive brush
 * discs overlap. A swept stroke is then the union of those dense discs with no
 * gaps between samples.
 */
function densifyWorldCenters(
  centers: Types.Point3[],
  stepWorld: number
): Types.Point3[] {
  if (centers.length <= 1 || !(stepWorld > 0)) {
    return centers;
  }
  const out: Types.Point3[] = [centers[0]];
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1];
    const b = centers[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(length / stepWorld));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + dx * t, a[1] + dy * t, a[2] + dz * t] as Types.Point3);
    }
  }
  return out;
}

/**
 * Integer oblique fill descriptor for a circle / ellipse brush (single click or
 * a swept click-drag stroke).
 *
 * The brush is a flat elliptical disc on the oblique view plane extruded through
 * a thin slab along the view normal - i.e. an elliptical *cylinder*, not an
 * ellipsoid. Modelling it as a cylinder (constant slab thickness, no rim taper)
 * keeps the fill watertight all the way to the disc edge; an ellipsoid tapers to
 * zero thickness at its rim and leaves holes there on oblique planes.
 *
 * Voxels are enumerated with the integer oblique iterator over the lattice
 * bounding box of the cylinder, and an exact world-space membership predicate
 * (in-plane ellipse union over the densified stroke, within the slab) selects the
 * fill. The slab half-thickness is floored at {@link minSlabHalfWorld} so a
 * single click paints a watertight one-voxel-thick oblique disc; a full-thickness
 * view widens the slab into a volume fill.
 *
 * @param operationData.slabThicknessWorld - Optional view slab thickness in world
 * units. When omitted (or non-positive) the slab is the watertight minimum, so
 * one oblique plane is painted.
 */
export function createCircleObliqueIntegerFill(operationData: {
  viewUp: Types.Point3;
  viewPlaneNormal: Types.Point3;
  centerIJK: Types.Point3;
  segmentationImageData: vtkImageData;
  xRadius: number;
  yRadius: number;
  strokeCentersWorld?: Types.Point3[];
  slabThicknessWorld?: number;
}): ObliqueIntegerFillDescriptor {
  const { segmentationImageData, centerIJK, xRadius, yRadius } = operationData;
  const { dimensions, direction, spacing } = volumeGeometryFromImageData(
    segmentationImageData
  );
  const { viewRight, viewUp } = viewAxesFromOperationData(operationData);
  const vn = vec3.normalize(
    vec3.create(),
    operationData.viewPlaneNormal as vec3
  ) as unknown as Types.Point3;
  const vr = viewRight as Types.Point3;
  const vu = viewUp as Types.Point3;

  const basis = createObliqueIntegerBasis({
    dimensions,
    direction,
    spacing,
    viewPlaneNormal: operationData.viewPlaneNormal,
    viewUp,
    viewRight,
  });

  // Degenerate brush (e.g. a preview with fewer than two points) - nothing to
  // fill; an empty w range makes callers fall back cleanly.
  if (!(xRadius > 0) || !(yRadius > 0)) {
    return { basis, dimensions, wRange: { min: 1, max: 0 } };
  }

  // Slab half-thickness (world, along the normal). Floor it at the watertight
  // minimum; a thicker requested view widens it into a volume fill.
  const M = buildVoxelToWorld(direction, spacing);
  const requestedHalf =
    operationData.slabThicknessWorld && operationData.slabThicknessWorld > 0
      ? operationData.slabThicknessWorld / 2
      : 0;
  const slabHalfWorld = Math.max(
    requestedHalf,
    minSlabHalfWorld(M, vn),
    Number.EPSILON
  );

  const centersWorld =
    operationData.strokeCentersWorld &&
    operationData.strokeCentersWorld.length > 0
      ? operationData.strokeCentersWorld
      : [
          transformIndexToWorld(
            segmentationImageData,
            centerIJK
          ) as Types.Point3,
        ];

  // Densify so consecutive discs overlap along a drag stroke.
  const denseCenters = densifyWorldCenters(
    centersWorld,
    Math.max(Math.min(xRadius, yRadius) / 2, Number.EPSILON)
  );

  // Lattice (u, v, w) bounding box of the cylinder - a superset that the
  // predicate trims exactly. A one-voxel margin covers voxel-center rounding.
  let minU = Infinity;
  let minV = Infinity;
  let minW = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  let maxW = -Infinity;
  for (const c of centersWorld) {
    for (const sr of [-1, 1]) {
      for (const su of [-1, 1]) {
        for (const sn of [-1, 1]) {
          const corner: Types.Point3 = [
            c[0] +
              sr * xRadius * vr[0] +
              su * yRadius * vu[0] +
              sn * slabHalfWorld * vn[0],
            c[1] +
              sr * xRadius * vr[1] +
              su * yRadius * vu[1] +
              sn * slabHalfWorld * vn[1],
            c[2] +
              sr * xRadius * vr[2] +
              su * yRadius * vu[2] +
              sn * slabHalfWorld * vn[2],
          ];
          const q = uvwFromIJK(
            transformWorldToIndex(
              segmentationImageData,
              corner
            ) as Types.Point3,
            basis
          );
          minU = Math.min(minU, q[0]);
          maxU = Math.max(maxU, q[0]);
          minV = Math.min(minV, q[1]);
          maxV = Math.max(maxV, q[1]);
          minW = Math.min(minW, q[2]);
          maxW = Math.max(maxW, q[2]);
        }
      }
    }
  }
  const uRange: IntRange = {
    min: Math.floor(minU) - 1,
    max: Math.ceil(maxU) + 1,
  };
  const vRange: IntRange = {
    min: Math.floor(minV) - 1,
    max: Math.ceil(maxV) + 1,
  };
  const wRange: IntRange = {
    min: Math.floor(minW) - 1,
    max: Math.ceil(maxW) + 1,
  };

  const ix = 1 / (xRadius * xRadius);
  const iy = 1 / (yRadius * yRadius);
  const predicate = ({ ijk }: ObliqueVoxelVisit): boolean => {
    // Test at the voxel's grid point (its rendered center). This must match the
    // location the renderer draws voxel `ijk` at - `transformIndexToWorld(ijk)`
    // for a point-data labelmap - otherwise a half-voxel bias shifts the slab off
    // the drawn plane and the oblique disc straddles two frames.
    const world = transformIndexToWorld(
      segmentationImageData,
      ijk
    ) as Types.Point3;
    for (const c of denseCenters) {
      const dx = world[0] - c[0];
      const dy = world[1] - c[1];
      const dz = world[2] - c[2];
      const np = dx * vn[0] + dy * vn[1] + dz * vn[2];
      if (Math.abs(np) > slabHalfWorld) {
        continue;
      }
      const xp = dx * vr[0] + dy * vr[1] + dz * vr[2];
      const yp = dx * vu[0] + dy * vu[1] + dz * vu[2];
      if (xp * xp * ix + yp * yp * iy <= 1) {
        return true;
      }
    }
    return false;
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
