import type { Types } from '@cornerstonejs/core';
// Epsilon for floating point comparisons
export const EPSILON = 1e-7; // A bit larger than glMatrix.EPSILON for robustness

// --- Basic Vector and Point Math ---
export function vec2Subtract(
  out: Types.Point2,
  a: Types.Point2,
  b: Types.Point2
): Types.Point2 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  return out;
}

export function vec2CrossZ(a: Types.Point2, b: Types.Point2): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function distanceSquared(p1: Types.Point2, p2: Types.Point2): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return dx * dx + dy * dy;
}

export function pointsAreEqual(p1: Types.Point2, p2: Types.Point2): boolean {
  return Math.abs(p1[0] - p2[0]) < EPSILON && Math.abs(p1[1] - p2[1]) < EPSILON;
}

// --- Geometric Primitives (Placeholders/Simplified) ---

/**
 * Calculates the intersection point of two line segments.
 * IMPORTANT: This is a simplified version. A robust solution needs to handle
 * collinear overlaps (which might produce two intersection points or an interval),
 * parallel lines, and floating point inaccuracies much more carefully.
 * This function's limitations are a likely source of issues for complex polygons.
 */
export function robustSegmentIntersection(
  p1: Types.Point2,
  p2: Types.Point2, // Segment 1
  q1: Types.Point2,
  q2: Types.Point2 // Segment 2
): Types.Point2 | null {
  const r = vec2Subtract([0, 0], p2, p1);
  const s = vec2Subtract([0, 0], q2, q1);
  const rxs = vec2CrossZ(r, s);
  const qmp = vec2Subtract([0, 0], q1, p1);
  const qmpxr = vec2CrossZ(qmp, r);

  if (Math.abs(rxs) < EPSILON) {
    // Collinear or parallel
    // Collinear check: if qmpxr is also zero, they are collinear.
    // Then, need to check for overlap. This is the hard part not fully handled here.
    // For true robustness, if collinear and overlapping, you'd return the
    // two endpoints of the overlap segment. This simple version doesn't.
    if (Math.abs(qmpxr) < EPSILON) {
      // Check for overlap for collinear segments
      const p1OnQ = (t: number) => t >= -EPSILON && t <= 1 + EPSILON;
      const q1OnP = (t: number) => t >= -EPSILON && t <= 1 + EPSILON;

      const t0 = vec2Dot(vec2Subtract([0, 0], q1, p1), r) / vec2Dot(r, r);
      const t1 = vec2Dot(vec2Subtract([0, 0], q2, p1), r) / vec2Dot(r, r);
      const u0 = vec2Dot(vec2Subtract([0, 0], p1, q1), s) / vec2Dot(s, s);
      const u1 = vec2Dot(vec2Subtract([0, 0], p2, q1), s) / vec2Dot(s, s);

      // This logic is still insufficient for full collinear overlap range.
      // A true clipping algorithm needs to create multiple intersection points
      // for the start and end of any collinear overlap.
      if (p1OnQ(t0) && pointsAreEqual(q1, p1_t(p1, r, t0))) {
        return q1;
      }
      if (p1OnQ(t1) && pointsAreEqual(q2, p1_t(p1, r, t1))) {
        return q2;
      }
      if (q1OnP(u0) && pointsAreEqual(p1, p1_t(q1, s, u0))) {
        return p1;
      }
      if (q1OnP(u1) && pointsAreEqual(p2, p1_t(q1, s, u1))) {
        return p2;
      }
    }
    return null; // Parallel non-intersecting or unhandled collinear
  }

  const t = vec2CrossZ(qmp, s) / rxs;
  const u = qmpxr / rxs;

  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    return [p1[0] + t * r[0], p1[1] + t * r[1]];
  }
  return null; // No intersection
}
export function vec2Dot(a: Types.Point2, b: Types.Point2): number {
  return a[0] * b[0] + a[1] * b[1];
}
export function p1_t(
  p1: Types.Point2,
  r: Types.Point2,
  t: number
): Types.Point2 {
  return [p1[0] + t * r[0], p1[1] + t * r[1]];
}

/**
 * Checks if a point is inside a polygon using the ray casting algorithm.
 */
export function isPointInPolygon(
  point: Types.Point2,
  polygon: Types.Point2[]
): boolean {
  if (!polygon || polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];

    // Check if point is on an edge
    // dist(xi,yi to point) + dist(point to xj,yj) == dist(xi,yi to xj,yj)
    const d_segment_sq = distanceSquared(polygon[i], polygon[j]);
    const d_pi_p_sq = distanceSquared(polygon[i], point);
    const d_pj_p_sq = distanceSquared(polygon[j], point);
    if (
      Math.abs(
        Math.sqrt(d_pi_p_sq) + Math.sqrt(d_pj_p_sq) - Math.sqrt(d_segment_sq)
      ) < EPSILON
    ) {
      return true; // Point is on the boundary
    }

    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculates the 2D normal of a polyline (proportional to area, indicates winding).
 * Sum of (x_i * y_{i+1} - x_{i+1} * y_i) / 2. Sign indicates winding.
 * Positive for CCW, Negative for CW (standard Cartesian).
 */
export function getPolylineSignedArea(polyline: Types.Point2[]): number {
  let area = 0;
  for (let i = 0; i < polyline.length; i++) {
    const p1 = polyline[i];
    const p2 = polyline[(i + 1) % polyline.length];
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return area / 2;
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
