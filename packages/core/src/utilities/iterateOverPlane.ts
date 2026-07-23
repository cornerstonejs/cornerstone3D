import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { Point3 } from '../types';
import getInPlaneSpacingAndXYDirections from './getInPlaneSpacingAndXYDirections';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';

/** Volume geometry the iteration needs. Matches what a vtkImageData exposes via
 * getDimensions()/getOrigin()/getDirection()/getSpacing(). */
export interface PlaneIterationVolume {
  dimensions: Point3;
  origin: Point3;
  direction: mat3 | number[];
  spacing: Point3;
}

export interface PlaneIterationPoint {
  pointIJK: Point3;
  pointLPS: Point3;
  index: number;
}

export interface PlaneIterationOptions {
  /** Focal point of the plane, in world space. */
  center: Point3;
  /** In-plane x (right) axis, world space. Normalized internally. */
  viewRight: Point3;
  /** In-plane y (up) axis, world space. Normalized internally. */
  viewUp: Point3;
  /** Half-extent along viewRight, in world mm. */
  uExtent: number;
  /** Half-extent along viewUp, in world mm. */
  vExtent: number;
  /**
   * Half-extent along the plane normal, in world mm. `0` (the default) iterates
   * a single zero-thickness plane; a positive value sweeps the stack of
   * parallel planes within the slab, which is how spheres / 3D ellipses reuse
   * this same iterator.
   */
  normalExtent?: number;
  /** Oversampling factor applied to the voxel-sized step. */
  subPixelResolution?: number;
  /** Optional shape test in plane coordinates (u, v, w in world mm). */
  pointInShapeFn?: (u: number, v: number, w: number) => boolean;
  /** Called once per unique in-bounds voxel that passes the shape test. */
  callback?: (point: PlaneIterationPoint) => void;
}

const EPSILON = 1e-9;

/**
 * Iterates the voxels that lie on an oriented plane (or thin slab) through a
 * volume, rather than walking the full axis-aligned IJK bounding box. For an
 * oblique plane the bounding box is mostly empty, so this visits ~O(N^2) in-plane
 * voxels instead of O(N^3) box voxels.
 *
 * The in-plane step size is the per-axis voxel spacing from
 * `getInPlaneSpacingAndXYDirections` (shared with the planar freehand area
 * code), divided by `subPixelResolution`. Sub-voxel sampling can map several
 * samples to the same voxel, so visited voxels are de-duplicated and each is
 * emitted exactly once.
 *
 * @param volume - Volume geometry (dimensions/origin/direction/spacing).
 * @param options - Plane definition, extents and callbacks.
 * @returns The de-duplicated voxels visited, in iteration order.
 */
export default function iterateOverPlane(
  volume: PlaneIterationVolume,
  options: PlaneIterationOptions
): PlaneIterationPoint[] {
  const { dimensions, origin, direction, spacing } = volume;
  const {
    center,
    viewRight,
    viewUp,
    uExtent,
    vExtent,
    normalExtent = 0,
    subPixelResolution = 1,
    pointInShapeFn,
    callback,
  } = options;

  const iVec = direction.slice(0, 3) as Point3;
  const jVec = direction.slice(3, 6) as Point3;
  const kVec = direction.slice(6, 9) as Point3;

  const right = vec3.normalize(vec3.create(), viewRight as vec3);
  const up = vec3.normalize(vec3.create(), viewUp as vec3);
  const normal = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), right, up)
  );

  // In-plane voxel-sized step (shared geometry with the freehand area code).
  const { spacing: inPlaneSpacing } = getInPlaneSpacingAndXYDirections(
    { direction, spacing },
    right as Point3,
    up as Point3
  );
  const stepU = inPlaneSpacing[0] / subPixelResolution;
  const stepV = inPlaneSpacing[1] / subPixelResolution;
  const stepW =
    getSpacingInNormalDirection(
      { direction: direction as mat3, spacing },
      normal as Point3
    ) / subPixelResolution;

  // world -> fractional index (valid for an orthonormal direction matrix).
  const worldToIndex = (world: vec3): [number, number, number] => {
    const rel = vec3.subtract(vec3.create(), world, origin as vec3);
    return [
      vec3.dot(rel, iVec as vec3) / spacing[0],
      vec3.dot(rel, jVec as vec3) / spacing[1],
      vec3.dot(rel, kVec as vec3) / spacing[2],
    ];
  };

  const indexToWorld = (ijk: Point3): Point3 => {
    const world = vec3.clone(origin as vec3);
    vec3.scaleAndAdd(world, world, iVec as vec3, ijk[0] * spacing[0]);
    vec3.scaleAndAdd(world, world, jVec as vec3, ijk[1] * spacing[1]);
    vec3.scaleAndAdd(world, world, kVec as vec3, ijk[2] * spacing[2]);
    return world as unknown as Point3;
  };

  const [dimX, dimY, dimZ] = dimensions;
  const visited = new Set<number>();
  const points: PlaneIterationPoint[] = [];

  const wStart = normalExtent > 0 ? -normalExtent : 0;
  const wEnd = normalExtent > 0 ? normalExtent : 0;

  for (let u = -uExtent; u <= uExtent + EPSILON; u += stepU) {
    for (let v = -vExtent; v <= vExtent + EPSILON; v += stepV) {
      for (let w = wStart; w <= wEnd + EPSILON; w += stepW) {
        if (pointInShapeFn && !pointInShapeFn(u, v, w)) {
          continue;
        }

        const world = vec3.clone(center as vec3);
        vec3.scaleAndAdd(world, world, right, u);
        vec3.scaleAndAdd(world, world, up, v);
        if (w !== 0) {
          vec3.scaleAndAdd(world, world, normal, w);
        }

        const fractional = worldToIndex(world);
        const i = Math.round(fractional[0]);
        const j = Math.round(fractional[1]);
        const k = Math.round(fractional[2]);

        if (i < 0 || i >= dimX || j < 0 || j >= dimY || k < 0 || k >= dimZ) {
          continue;
        }

        const index = i + j * dimX + k * dimX * dimY;
        if (visited.has(index)) {
          continue;
        }
        visited.add(index);

        const pointIJK = [i, j, k] as Point3;
        const point: PlaneIterationPoint = {
          pointIJK,
          pointLPS: indexToWorld(pointIJK),
          index,
        };
        points.push(point);
        callback?.(point);
      }
    }
  }

  return points;
}
