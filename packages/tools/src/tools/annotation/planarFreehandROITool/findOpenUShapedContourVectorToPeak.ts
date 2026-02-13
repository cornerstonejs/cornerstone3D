import type { Types } from '@cornerstonejs/core';
import type { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import { vec2 } from 'gl-matrix';

/**
 * Finds the length of the longest line from the midpoint of the line
 * that joins the start and end of the open contour, to the surface of the
 * open contour.
 */
export default function findOpenUShapedContourVectorToPeak(
  canvasPoints: Types.Point2[],
  viewport: Types.IStackViewport | Types.IVolumeViewport
): Types.Point3[] {
  // Find chord from first to last point.
  const first = canvasPoints[0];
  const last = canvasPoints[canvasPoints.length - 1];

  const firstToLastUnitVector = vec2.create();

  vec2.set(firstToLastUnitVector, last[0] - first[0], last[1] - first[1]);
  vec2.normalize(firstToLastUnitVector, firstToLastUnitVector);

  // Get the two possible normal vector to this vector
  // Note: Use the identity that the perpendicular line must have a gradient of
  // 1 / gradient of the line.

  const normalVector1 = vec2.create();
  const normalVector2 = vec2.create();

  vec2.set(normalVector1, -firstToLastUnitVector[1], firstToLastUnitVector[0]);
  vec2.set(normalVector2, firstToLastUnitVector[1], -firstToLastUnitVector[0]);

  // Find the center of the chord.
  const centerOfFirstToLast: Types.Point2 = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
  ];

  // Get furthest point.

  const furthest = {
    dist: 0,
    index: null,
  };

  for (let i = 0; i < canvasPoints.length; i++) {
    const canvasPoint = canvasPoints[i];

    const distance = vec2.dist(canvasPoint, <vec2>centerOfFirstToLast);

    if (distance > furthest.dist) {
      furthest.dist = distance;
      furthest.index = i;
    }
  }

  const toFurthest: [Types.Point2, Types.Point2] = [
    canvasPoints[furthest.index],
    centerOfFirstToLast,
  ];
  const toFurthestWorld = toFurthest.map(viewport.canvasToWorld);

  return toFurthestWorld;
}

/**
 * Resolves the correct peak-finding function based on the U-shape variant
 * and returns the vector to the peak. Returns null for variants that don't
 * need a peak (e.g. 'lineSegment').
 */
export function resolveVectorToPeak(
  canvasPoints: Types.Point2[],
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  variant: PlanarFreehandROIAnnotation['data']['isOpenUShapeContour']
): Types.Point3[] | null {
  if (variant === 'orthogonalT') {
    return findOpenUShapedContourVectorToPeakOrthogonal(canvasPoints, viewport);
  }

  if (variant === 'lineSegment') {
    return null;
  }

  // true, 'farthestT', or any other truthy value
  if (variant) {
    return findOpenUShapedContourVectorToPeak(canvasPoints, viewport);
  }

  return null;
}

/**
 * OnRender variant of resolveVectorToPeak — reads the variant and polyline
 * from the annotation itself.
 */
export function resolveVectorToPeakOnRender(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation
): Types.Point3[] | null {
  const { viewport } = enabledElement;
  const canvasPoints = annotation.data.contour.polyline.map(
    viewport.worldToCanvas
  );

  return resolveVectorToPeak(
    canvasPoints,
    viewport,
    annotation.data.isOpenUShapeContour
  );
}

/**
 * Finds the intersection of the perpendicular from the chord midpoint with the
 * contour surface. The T-line is orthogonal to the chord connecting the two
 * endpoints of the open contour.
 */
function findOpenUShapedContourVectorToPeakOrthogonal(
  canvasPoints: Types.Point2[],
  viewport: Types.IStackViewport | Types.IVolumeViewport
): Types.Point3[] {
  // Find chord from first to last point.
  const first = canvasPoints[0];
  const last = canvasPoints[canvasPoints.length - 1];

  const firstToLastUnitVector = vec2.create();

  vec2.set(firstToLastUnitVector, last[0] - first[0], last[1] - first[1]);
  vec2.normalize(firstToLastUnitVector, firstToLastUnitVector);

  // Get the two possible normal vectors to the chord
  const normalVector1: Types.Point2 = [
    -firstToLastUnitVector[1],
    firstToLastUnitVector[0],
  ];
  const normalVector2: Types.Point2 = [
    firstToLastUnitVector[1],
    -firstToLastUnitVector[0],
  ];

  // Find the center of the chord.
  const centerOfFirstToLast: Types.Point2 = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
  ];

  // Cast rays in both normal directions and find the farthest intersection
  // with the contour segments.
  let bestT = -1;
  let bestIntersection: Types.Point2 | null = null;

  for (const dir of [normalVector1, normalVector2]) {
    for (let i = 0; i < canvasPoints.length - 1; i++) {
      const p1 = canvasPoints[i];
      const p2 = canvasPoints[i + 1];

      // Solve: centerOfFirstToLast + t * dir = p1 + u * (p2 - p1)
      // Using the standard ray-segment intersection formula.
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];

      const denom = dir[0] * dy - dir[1] * dx;

      if (Math.abs(denom) < 1e-10) {
        continue; // Parallel
      }

      const t =
        ((p1[0] - centerOfFirstToLast[0]) * dy -
          (p1[1] - centerOfFirstToLast[1]) * dx) /
        denom;
      const u =
        ((p1[0] - centerOfFirstToLast[0]) * dir[1] -
          (p1[1] - centerOfFirstToLast[1]) * dir[0]) /
        denom;

      if (t > 0 && u >= 0 && u <= 1) {
        if (t > bestT) {
          bestT = t;
          bestIntersection = [
            centerOfFirstToLast[0] + t * dir[0],
            centerOfFirstToLast[1] + t * dir[1],
          ];
        }
      }
    }
  }

  // If no intersection found, fall back to the existing farthest-point logic.
  if (!bestIntersection) {
    return findOpenUShapedContourVectorToPeak(canvasPoints, viewport);
  }

  const toOrthogonal: [Types.Point2, Types.Point2] = [
    bestIntersection,
    centerOfFirstToLast,
  ];
  const toOrthogonalWorld = toOrthogonal.map(viewport.canvasToWorld);

  return toOrthogonalWorld;
}
