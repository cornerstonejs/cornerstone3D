import type { Types } from '@cornerstonejs/core';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import { vec2 } from 'gl-matrix';

export default function findOpenCardiacAnnotationVectorToPeak(
  canvasPoints: Types.Point2[],
  viewport: Types.IStackViewport | Types.IVolumeViewport
): Types.Point3[] {
  //Find chord from first to last point.
  const first = canvasPoints[0];
  const last = canvasPoints[canvasPoints.length - 1];

  const firstToLastVector = vec2.create();

  vec2.set(firstToLastVector, last[0] - first[0], last[1] - first[1]);

  const firstToLastUnitVector = vec2.create();

  vec2.normalize(firstToLastUnitVector, firstToLastVector);

  // Get two possible normal vector to this vector
  // Note: Use the identity that the perpendicular line must have a gradient of
  // 1 / gradient of the line.

  const normalVector1 = vec2.create();
  const normalVector2 = vec2.create();

  vec2.set(normalVector1, -firstToLastUnitVector[1], firstToLastUnitVector[0]);
  vec2.set(normalVector2, firstToLastUnitVector[1], -firstToLastUnitVector[0]);

  debugger;

  // Find the center of the chord.
  const centerOfFirstToLast = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
  ];

  // Find the size of the annotation so we have a good line to check the crossing on.

  // Dot product of perpendicular lines are 0

  // Find perpendicular line (In the direction that goes to the points).

  // const gradientOfFirstToLast = (last[1] - first[1]) / (last[0] - first[0]);

  // const gradientOfPerpendicularLine;

  debugger;

  // Find where this line, extended to greater than the size of the annotation, crosses the annotation.
  // Convert that line to world coordinates.
  // return the world coordinates
}

export function findOpenCardiacAnnotationVectorToPeakOnRender(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation
): Types.Point3[] {
  const { viewport } = enabledElement;
  const canvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);

  return findOpenCardiacAnnotationVectorToPeak(canvasPoints, viewport);
}
