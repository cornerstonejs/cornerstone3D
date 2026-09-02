import { vec3 } from 'gl-matrix';
import type { Point2, Point3 } from '../../../types';
import type { IndexSpaceSlab, VolumeGeometry } from '../indexSpaceSlab';
import getVoxelThicknessAlongNormal from '../getVoxelThicknessAlongNormal';
import { projectPointOntoPlane } from '../slabMembership';
import type { PlaneBasis, VoxelSlabShape } from './shapeGeometry';
import {
  SHAPE_BOUNDARY_EPSILON,
  createColumnLineResolver,
  createPlaneBasis,
  toIntegerRun,
} from './shapeGeometry';

export interface ContourShapeOptions {
  /** Geometry of the volume being measured. */
  volume: VolumeGeometry;
  /** `P0`, the annotation plane anchor. Defines the plane's depth. */
  planePoint: Point3;
  /** `n`, the annotation view plane normal. Unit length. */
  normal: Point3;
  /**
   * The outline, as world coordinates. Treated as a closed polygon: the last
   * point is joined back to the first, so do not repeat it. Points are
   * projected onto the annotation plane, so a contour carrying a little depth
   * error - as a drawn one always does - is handled.
   *
   * Need not be convex, and may be self-intersecting; interior is decided by
   * the even-odd rule.
   */
  polyline: Point3[];
  /**
   * The contour's extent along the normal, in mm. This is the thickness of the
   * prism the outline sweeps.
   *
   * Unlike the ellipsoid and box, this is *not* applied by the shape. A prism's
   * depth constraint is exactly Rule M's slab, so applying it twice would only
   * risk the two disagreeing. Pass `getRequiredThickness()` as the iterator's
   * `annotationThickness` and the slab enforces it, complete with the half
   * voxel dilation that guarantees at least one layer is selected.
   *
   * Omit to let the slab decide the depth entirely.
   */
  depth?: number;
}

/** A point in the plane's 2D basis, relative to the plane anchor. */
type PlanePoint = [number, number];

/**
 * A contour lying in the annotation plane, swept into a prism by its depth.
 *
 * ## Why the runs are exact
 *
 * For a fixed outer and row index, the projection of the voxel centres onto the
 * annotation plane traces a straight line in the column index. Intersecting
 * that line with the polygon gives a sorted set of crossings, and consecutive
 * pairs bound the inside intervals. A convex contour yields one run; a
 * non-convex one yields as many as it has crossings, which is the
 * exact-multiple case the iterator supports. No voxel is ever tested.
 *
 * Interior is the even-odd rule.
 *
 * ## Boundary handling
 *
 * A point lying exactly on the outline is inside it. This needs stating because
 * the two halves of the shape reach their answer by different routes:
 * `containsPoint` casts a ray along one axis of the plane basis, while
 * `getRuns` intersects a line running along whichever direction the column axis
 * projects to. Even-odd is direction independent for points genuinely inside or
 * outside, but a point *on* the boundary is decided by whichever tie rule the
 * ray or line happens to hit, and those degenerate at different geometry - one
 * where an outline edge shares a row, the other where it shares a column.
 *
 * That case is not exotic: a rectangular contour drawn on voxel boundaries puts
 * a whole row of voxel centres exactly on an edge. Both routes therefore widen
 * the outline by a relative epsilon, so anything within that slack of the
 * boundary is inside for both. See `SHAPE_BOUNDARY_EPSILON`.
 *
 * ## Depth
 *
 * The outline test is purely in-plane; depth is left to Rule M's slab. See
 * `ContourShapeOptions.depth`.
 */
export function createContourShape(
  options: ContourShapeOptions
): VoxelSlabShape {
  const { volume, planePoint, normal, polyline, depth } = options;

  if (!polyline?.length || polyline.length < 3) {
    throw new Error('A contour needs at least three points');
  }

  // Any in-plane direction will do for the basis; the outline defines its own
  // orientation. Pick one that is not parallel to the normal.
  const candidate: Point3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const basis: PlaneBasis = createPlaneBasis(
    normal,
    vec3.cross(vec3.create(), normal as vec3, candidate as vec3) as Point3
  );

  const toPlanePoint = (point: Point3): PlanePoint => [
    (point[0] - planePoint[0]) * basis.u[0] +
      (point[1] - planePoint[1]) * basis.u[1] +
      (point[2] - planePoint[2]) * basis.u[2],
    (point[0] - planePoint[0]) * basis.v[0] +
      (point[1] - planePoint[1]) * basis.v[1] +
      (point[2] - planePoint[2]) * basis.v[2],
  ];

  const toPlaneDirection = (vector: Point3): PlanePoint => [
    vector[0] * basis.u[0] + vector[1] * basis.u[1] + vector[2] * basis.u[2],
    vector[0] * basis.v[0] + vector[1] * basis.v[1] + vector[2] * basis.v[2],
  ];

  // Projecting first means a contour whose points carry depth error still gives
  // a well-defined outline.
  const outline: PlanePoint[] = polyline.map((point) =>
    toPlanePoint(projectPointOntoPlane(point, planePoint, basis.n))
  );
  const vertexCount = outline.length;

  // Slack scaled to the outline's own size, so it means the same thing for a
  // 2 mm nodule contour and a 400 mm body contour.
  let extent = 0;
  for (const [x, y] of outline) {
    extent = Math.max(extent, Math.abs(x), Math.abs(y));
  }
  const boundarySlack = Math.max(extent, 1) * SHAPE_BOUNDARY_EPSILON;

  /** Distance from a plane point to the nearest outline edge. */
  function distanceToOutline([x, y]: PlanePoint): number {
    let best = Infinity;
    for (let i = 0, j = vertexCount - 1; i < vertexCount; j = i++) {
      const [xi, yi] = outline[i];
      const [xj, yj] = outline[j];
      const edgeX = xj - xi;
      const edgeY = yj - yi;
      const lengthSquared = edgeX * edgeX + edgeY * edgeY;
      let t = 0;
      if (lengthSquared > 0) {
        t = ((x - xi) * edgeX + (y - yi) * edgeY) / lengthSquared;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const dx = x - (xi + t * edgeX);
      const dy = y - (yi + t * edgeY);
      const distance = Math.hypot(dx, dy);
      if (distance < best) {
        best = distance;
      }
    }
    return best;
  }

  const voxelThickness = getVoxelThicknessAlongNormal(volume, basis.n);
  const resolveColumnLine = createColumnLineResolver(volume, basis.n);

  function containsPlanePoint([x, y]: PlanePoint): boolean {
    let inside = false;
    for (let i = 0, j = vertexCount - 1; i < vertexCount; j = i++) {
      const [xi, yi] = outline[i];
      const [xj, yj] = outline[j];

      // Half-open in y so a vertex is counted by exactly one of its edges.
      if (yi > y !== yj > y) {
        const crossingX = xi + ((y - yi) / (yj - yi)) * (xj - xi);
        if (x < crossingX) {
          inside = !inside;
        }
      }
    }
    // On the outline counts as inside, whichever side the ray's tie rule
    // happened to pick.
    return inside || distanceToOutline([x, y]) <= boundarySlack;
  }

  function containsPoint(point: Point3): boolean {
    return containsPlanePoint(
      toPlanePoint(projectPointOntoPlane(point, planePoint, basis.n))
    );
  }

  function* getRuns(
    outerIndex: number,
    rowIndex: number,
    depthRun: Point2,
    slab: IndexSpaceSlab
  ): Generator<Point2, void, undefined> {
    const line = resolveColumnLine(slab, outerIndex, rowIndex);
    const origin2 = toPlanePoint(line.projectedBase);
    const direction2 = toPlaneDirection(line.projectedStep);

    const directionLengthSquared =
      direction2[0] * direction2[0] + direction2[1] * direction2[1];

    if (directionLengthSquared <= 0) {
      // The whole column projects to a single point, so the outline either
      // covers all of it or none. Only reachable if the column step is parallel
      // to the normal.
      if (containsPlanePoint(origin2)) {
        yield [depthRun[0], depthRun[1]];
      }
      return;
    }

    const directionLength = Math.sqrt(directionLengthSquared);
    // The slack, expressed in column-index units.
    const slack = boundarySlack / directionLength;
    // Perpendicular distance from the line, per unit of the side value.
    const perpendicularScale = 1 / directionLength;

    /** Column index of the point on the line nearest a plane point. */
    const columnOf = ([x, y]: PlanePoint) =>
      ((x - origin2[0]) * direction2[0] + (y - origin2[1]) * direction2[1]) /
      directionLengthSquared;

    const sideOf = ([x, y]: PlanePoint) =>
      direction2[0] * (y - origin2[1]) - direction2[1] * (x - origin2[0]);

    const intervals: [number, number][] = [];
    const crossings: number[] = [];

    let previousIndex = vertexCount - 1;
    let previousSide = sideOf(outline[previousIndex]);

    for (let i = 0; i < vertexCount; i++) {
      const side = sideOf(outline[i]);

      const previousOnLine =
        Math.abs(previousSide) * perpendicularScale <= boundarySlack;
      const currentOnLine =
        Math.abs(side) * perpendicularScale <= boundarySlack;

      if (previousOnLine && currentOnLine) {
        // The edge lies along the line. The crossing test cannot see such an
        // edge at all - both endpoints sit on the same side of a line they are
        // on - so contribute its own extent directly. Without this, a contour
        // with an edge running along a voxel row loses that whole row, while
        // `containsPoint` keeps it as a boundary point.
        const a = columnOf(outline[previousIndex]);
        const b = columnOf(outline[i]);
        intervals.push(
          a <= b ? [a - slack, b + slack] : [b - slack, a + slack]
        );
      } else if (currentOnLine) {
        // A vertex touching the line without either edge lying along it. Even
        // odd counting may place it outside, but it is on the boundary, so it
        // is inside by the same convention `containsPoint` applies.
        const at = columnOf(outline[i]);
        intervals.push([at - slack, at + slack]);
      }

      // Zero counts as negative, matching the half-open `yi > y !== yj > y`
      // rule in containsPlanePoint.
      if (previousSide > 0 !== side > 0) {
        const t = previousSide / (previousSide - side);
        const crossingX =
          outline[previousIndex][0] +
          t * (outline[i][0] - outline[previousIndex][0]);
        const crossingY =
          outline[previousIndex][1] +
          t * (outline[i][1] - outline[previousIndex][1]);
        crossings.push(columnOf([crossingX, crossingY]));
      }

      previousIndex = i;
      previousSide = side;
    }

    crossings.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      intervals.push([crossings[pair] - slack, crossings[pair + 1] + slack]);
    }

    if (!intervals.length) {
      return;
    }

    // Merge so overlapping contributions - a crossing interval and the boundary
    // edge bounding it, say - never emit a voxel twice.
    intervals.sort((a, b) => a[0] - b[0]);
    let [low, high] = intervals[0];

    for (let index = 1; index < intervals.length; index++) {
      const [nextLow, nextHigh] = intervals[index];
      if (nextLow <= high) {
        high = Math.max(high, nextHigh);
        continue;
      }
      const run = toIntegerRun([low, high]);
      if (run) {
        yield run;
      }
      low = nextLow;
      high = nextHigh;
    }

    const finalRun = toIntegerRun([low, high]);
    if (finalRun) {
      yield finalRun;
    }
  }

  return {
    containsPoint,
    getRuns,
    // The prism's depth, which the caller should hand to the slab. Falling back
    // to one voxel matches the default the slab itself would apply.
    getRequiredThickness: () =>
      Number.isFinite(depth) ? (depth as number) : voxelThickness,
  };
}
