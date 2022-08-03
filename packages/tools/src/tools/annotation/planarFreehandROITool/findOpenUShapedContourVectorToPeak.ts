import type { Types } from '@cornerstonejs/core';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
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

export function findOpenUShapedContourVectorToPeakOnRender(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation
): Types.Point3[] {
  const { viewport } = enabledElement;
  const canvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);

  return findOpenUShapedContourVectorToPeak(canvasPoints, viewport);
}
