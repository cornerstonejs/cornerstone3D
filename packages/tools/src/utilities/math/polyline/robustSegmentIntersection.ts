import { utilities, type Types } from '@cornerstonejs/core';
import { vec2 } from 'gl-matrix';

// Epsilon for floating point comparisons
export const EPSILON = 1e-7; // A bit larger than glMatrix.EPSILON for robustness

// --- Basic Vector and Point Math ---

export function vec2CrossZ(a: Types.Point2, b: Types.Point2): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function pointsAreEqual(p1: Types.Point2, p2: Types.Point2): boolean {
  return utilities.isEqual(p1, p2, EPSILON);
}

/**
 * Calculates the intersection point of two line segments using a robust algorithm.
 *
 * This function uses parametric line equations to find intersections and handles
 * several edge cases including:
 * - Parallel segments (returns null)
 * - Collinear segments with overlap (returns the first valid intersection point)
 * - Floating-point precision issues (uses EPSILON tolerance)
 *
 * The algorithm is based on the line-line intersection method where two segments
 * are represented as:
 * - Segment 1: p1 + t * (p2 - p1), where t ∈ [0, 1]
 * - Segment 2: q1 + u * (q2 - q1), where u ∈ [0, 1]
 *
 * For collinear segments, the function attempts to find a single intersection point
 * by checking if any endpoint of one segment lies on the other segment.
 *
 * @param p1 - First point of the first line segment [x, y]
 * @param p2 - Second point of the first line segment [x, y]
 * @param q1 - First point of the second line segment [x, y]
 * @param q2 - Second point of the second line segment [x, y]
 * @returns The intersection point as [x, y] coordinates, or null if:
 *          - Segments are parallel and non-intersecting
 *          - Segments don't intersect within their bounds
 *          - Collinear segments don't overlap
 */
export function robustSegmentIntersection(
  p1: Types.Point2,
  p2: Types.Point2, // Segment 1
  q1: Types.Point2,
  q2: Types.Point2 // Segment 2
): Types.Point2 | null {
  const r = vec2.subtract(vec2.create(), p2, p1) as Types.Point2;
  const s = vec2.subtract(vec2.create(), q2, q1) as Types.Point2;
  const rxs = vec2CrossZ(r, s);
  const qmp = vec2.subtract(vec2.create(), q1, p1) as Types.Point2;
  const qmpxr = vec2CrossZ(qmp, r);

  // Check if segments are parallel or collinear
  if (Math.abs(rxs) < EPSILON) {
    // Check if segments are collinear
    if (Math.abs(qmpxr) < EPSILON) {
      // Segments are collinear - check for overlap
      // Project all points onto the direction vector of the first segment
      const rDotR = vec2.dot(r, r);
      const sDotS = vec2.dot(s, s);

      // Avoid division by zero for degenerate segments
      if (rDotR < EPSILON || sDotS < EPSILON) {
        // One or both segments are degenerate (points)
        if (pointsAreEqual(p1, q1) || pointsAreEqual(p1, q2)) {
          return p1;
        }
        if (pointsAreEqual(p2, q1) || pointsAreEqual(p2, q2)) {
          return p2;
        }
        return null;
      }

      // Calculate parameter values for projecting q1 and q2 onto segment p1-p2
      const t0 = vec2.dot(vec2.subtract(vec2.create(), q1, p1), r) / rDotR;
      const t1 = vec2.dot(vec2.subtract(vec2.create(), q2, p1), r) / rDotR;

      // Calculate parameter values for projecting p1 and p2 onto segment q1-q2
      const u0 = vec2.dot(vec2.subtract(vec2.create(), p1, q1), s) / sDotS;
      const u1 = vec2.dot(vec2.subtract(vec2.create(), p2, q1), s) / sDotS;

      // Check for overlap by testing if any endpoint lies within the other segment
      const isInRange = (t: number) => t >= -EPSILON && t <= 1 + EPSILON;

      // Check if q1 lies on segment p1-p2
      if (isInRange(t0)) {
        const projectedPoint = vec2.scaleAndAdd(
          vec2.create(),
          p1,
          r,
          t0
        ) as Types.Point2;
        if (pointsAreEqual(q1, projectedPoint)) {
          return q1;
        }
      }

      // Check if q2 lies on segment p1-p2
      if (isInRange(t1)) {
        const projectedPoint = vec2.scaleAndAdd(
          vec2.create(),
          p1,
          r,
          t1
        ) as Types.Point2;
        if (pointsAreEqual(q2, projectedPoint)) {
          return q2;
        }
      }

      // Check if p1 lies on segment q1-q2
      if (isInRange(u0)) {
        const projectedPoint = vec2.scaleAndAdd(
          vec2.create(),
          q1,
          s,
          u0
        ) as Types.Point2;
        if (pointsAreEqual(p1, projectedPoint)) {
          return p1;
        }
      }

      // Check if p2 lies on segment q1-q2
      if (isInRange(u1)) {
        const projectedPoint = vec2.scaleAndAdd(
          vec2.create(),
          q1,
          s,
          u1
        ) as Types.Point2;
        if (pointsAreEqual(p2, projectedPoint)) {
          return p2;
        }
      }
    }

    // Segments are parallel but not collinear, or collinear but don't overlap
    return null;
  }

  // Calculate intersection parameters
  const t = vec2CrossZ(qmp, s) / rxs;
  const u = qmpxr / rxs;

  // Check if intersection point lies within both segments
  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    // Calculate and return the intersection point
    return [p1[0] + t * r[0], p1[1] + t * r[1]];
  }

  return null; // No intersection within segment bounds
}

// --- Augmented Polyline Node Structure and Helper ---
export enum PolylineNodeType {
  Vertex,
  Intersection,
}
export enum IntersectionDirection {
  Entering,
  Exiting,
  Unknown,
}

export interface AugmentedPolyNode {
  id: string; // Unique ID: "polyIndex_nodeIndex"
  coordinates: Types.Point2;
  type: PolylineNodeType;
  originalPolyIndex: 0 | 1; // 0 for target, 1 for source
  originalVertexIndex?: number; // If type is Vertex

  // Links within its own polyline's list
  next: AugmentedPolyNode;
  prev: AugmentedPolyNode;

  // For intersection points
  isIntersection: boolean;
  partnerNode?: AugmentedPolyNode; // Corresponding node on the other polyline
  intersectionDir?: IntersectionDirection; // For target nodes: Entering/Exiting source
  intersectionInfo?: IntersectionInfo; // <<< ADDED: Store full IntersectionInfo for pairing
  alpha?: number; // Parameter along its own segment (0 to 1)
  processedInPath?: boolean; // New flag for path reconstruction

  visited: boolean; // For traversal algorithm
}

// --- Main Subtraction Logic ---

export type IntersectionInfo = {
  coord: Types.Point2;
  seg1Idx: number; // Segment index in poly1
  seg2Idx: number; // Segment index in poly2
  alpha1: number; // Parameter along segment 1 (0-1)
  alpha2: number; // Parameter along segment 2 (0-1)
};
