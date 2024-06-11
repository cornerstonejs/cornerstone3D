import type { Types } from '@cornerstonejs/core';
import type { Annotation, ContourAnnotation } from '../../types';
import { getAnnotation } from '../../stateManagement';

/**
 * Get child polylines data in world space for contour annotations that represent the holes
 * @param annotation - Annotation
 * @param viewport - Viewport used to convert the points from world to canvas space
 * @returns An array that contains all child polylines (holes) in world space
 */
export default function getContourHolesDataWorld(
  annotation: Annotation
): Types.Point3[][] {
  const childAnnotationUIDs = annotation.childAnnotationUIDs ?? [];

  return childAnnotationUIDs.map(
    (uid) => (getAnnotation(uid) as ContourAnnotation).data.contour.polyline
  );
}
