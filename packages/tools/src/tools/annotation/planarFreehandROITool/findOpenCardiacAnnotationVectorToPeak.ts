import type { Types } from '@cornerstonejs/core';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import { polyline } from '../../../utilities/math';

const { getClosestIntersectionWithPolyline } = polyline;
import { vec2 } from 'gl-matrix';

/**
 * Finds the length of the perpendicular line from the midpoint of the line
 * that joins the start and end of the open contour, to the surface of the
 * open contour.
 */
export default function findOpenCardiacAnnotationVectorToPeak(
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
  const centerOfFirstToLast = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
  ];

  // Find the size of the annotation so we have a good line to check the crossing on.
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let i = 0; i < canvasPoints.length; i++) {
    const [x, y] = canvasPoints[i];

    if (x > xMax) {
      xMax = x;
    } else if (x < xMin) {
      xMin = x;
    }

    if (y > yMax) {
      yMax = y;
    } else if (y < yMin) {
      yMin = y;
    }
  }

  const height = yMax - yMin;
  const width = xMax - xMin;

  const diagonal = Math.sqrt(width * width + height * height);

  // Make the line a bit longer to make sure it crosses in the most extreme case.
  const testCrossLength = diagonal * 1.1;

  const testChord1 = [
    [centerOfFirstToLast[0], centerOfFirstToLast[1]],
    [
      centerOfFirstToLast[0] + normalVector1[0] * testCrossLength,
      centerOfFirstToLast[1] + normalVector1[1] * testCrossLength,
    ],
  ];

  const testChord2 = [
    [centerOfFirstToLast[0], centerOfFirstToLast[1]],
    [
      centerOfFirstToLast[0] + normalVector2[0] * testCrossLength,
      centerOfFirstToLast[1] + normalVector2[1] * testCrossLength,
    ],
  ];

  const testChord1CrossingData = getClosestIntersectionWithPolyline(
    canvasPoints,
    testChord1[0],
    testChord1[1],
    false
  );
  const testChord2CrossingData = getClosestIntersectionWithPolyline(
    canvasPoints,
    testChord2[0],
    testChord2[1],
    false
  );

  // Find which normal direction to use and the distance of the chord
  let normalToUse;
  let distance;

  if (
    testChord1CrossingData !== undefined &&
    testChord2CrossingData !== undefined
  ) {
    // Find the furthest crossing if both cross.
    if (testChord1CrossingData.distance > testChord2CrossingData.distance) {
      normalToUse = normalVector1;
      distance = testChord1CrossingData.distance;
    } else {
      normalToUse = normalVector2;
      distance = testChord1CrossingData.distance;
    }
  } else if (testChord1CrossingData === undefined) {
    normalToUse = normalVector2;
    distance = testChord2CrossingData.distance;
  } else {
    normalToUse = normalVector1;
    distance = testChord1CrossingData.distance;
  }

  const chordCanvas = [
    [centerOfFirstToLast[0], centerOfFirstToLast[1]],
    [
      centerOfFirstToLast[0] + normalToUse[0] * distance,
      centerOfFirstToLast[1] + normalToUse[1] * distance,
    ],
  ];

  // Convert that line to world coordinates and return
  // return the world coordinates
  const chordWorldPos = chordCanvas.map(viewport.canvasToWorld);

  return chordWorldPos;
}

export function findOpenCardiacAnnotationVectorToPeakOnRender(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation
): Types.Point3[] {
  const { viewport } = enabledElement;
  const canvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);

  return findOpenCardiacAnnotationVectorToPeak(canvasPoints, viewport);
}
