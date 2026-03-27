import type { Types } from '@cornerstonejs/core';

const EPSILON = 1e-3;

function clonePoint(point: Types.Point3): Types.Point3 {
  return [point[0], point[1], point[2]] as Types.Point3;
}

function isSamePoint(a: Types.Point3, b: Types.Point3): boolean {
  return (
    Math.abs(a[0] - b[0]) < EPSILON &&
    Math.abs(a[1] - b[1]) < EPSILON &&
    Math.abs(a[2] - b[2]) < EPSILON
  );
}

export function appendLazyBrushStrokePoint(
  points: Types.Point3[] = [],
  point?: Types.Point3
): Types.Point3[] {
  if (!point) {
    return points;
  }

  if (points.length && isSamePoint(points[points.length - 1], point)) {
    return points;
  }

  return [...points, clonePoint(point)];
}

export function appendLazyBrushPreviewCircle(
  existingPoints: Types.Point3[] = [],
  circlePoints: Types.Point3[] = []
): Types.Point3[] {
  if (!circlePoints.length) {
    return existingPoints;
  }

  const nextCircle = circlePoints.map((point) => clonePoint(point));

  if (!existingPoints.length) {
    return nextCircle;
  }

  const previousCircle = existingPoints.slice(-nextCircle.length);
  const isDuplicateCircle =
    previousCircle.length === nextCircle.length &&
    previousCircle.every((point, index) =>
      isSamePoint(point, nextCircle[index])
    );

  if (isDuplicateCircle) {
    return existingPoints;
  }

  return [...existingPoints, ...nextCircle];
}
