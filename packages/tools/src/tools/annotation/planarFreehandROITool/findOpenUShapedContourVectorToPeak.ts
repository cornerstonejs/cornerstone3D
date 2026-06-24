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
): Types.Point3[] | null {
  // Find chord from first to last point.
  const first = canvasPoints[0];
  const last = canvasPoints[canvasPoints.length - 1];

  const firstToLastUnitVector = vec2.sub(vec2.create(), last, first);
  vec2.normalize(firstToLastUnitVector, firstToLastUnitVector);

  // The chord direction is used for the dot-product test: a point is
  // orthogonal to the chord when its displacement from the center has
  // zero dot product with the chord direction.
  const chordDir: Types.Point2 = [
    firstToLastUnitVector[0] as number,
    firstToLastUnitVector[1] as number,
  ];

  // Find the center of the chord.
  const centerOfFirstToLast: Types.Point2 = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
  ];

  // Single-pass: walk the contour and look for where the dot product of
  // (point - center) with the chord direction changes sign — that's where
  // the perpendicular from the midpoint crosses the contour. Interpolate
  // between the two bracketing points for a precise intersection.
  const delta = vec2.create();
  let prevDp: number | null = null;
  let prevPoint: Types.Point2 | null = null;
  let orthogonalPoint: Types.Point2 | null = null;

  for (const p of canvasPoints) {
    vec2.sub(delta, p, centerOfFirstToLast);
    const dp = vec2.dot(chordDir, delta);

    if (prevDp !== null && prevDp * dp < 0) {
      // Sign change — interpolate between prevPoint and p
      const t = Math.abs(prevDp) / (Math.abs(prevDp) + Math.abs(dp));
      orthogonalPoint = [
        prevPoint[0] + t * (p[0] - prevPoint[0]),
        prevPoint[1] + t * (p[1] - prevPoint[1]),
      ];
      break;
    }

    if (Math.abs(dp) < 1e-10) {
      orthogonalPoint = p;
      break;
    }

    prevDp = dp;
    prevPoint = p;
  }

  if (!orthogonalPoint) {
    console.warn('No orthogonal intersection found for open U-shaped contour');
    return null;
  }

  const toOrthogonal: [Types.Point2, Types.Point2] = [
    orthogonalPoint,
    centerOfFirstToLast,
  ];
  const toOrthogonalWorld = toOrthogonal.map(viewport.canvasToWorld);

  return toOrthogonalWorld;
}
