import { vec3 } from 'gl-matrix';
import { CONSTANTS } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { Annotations, Annotation } from '../../types';

const { EPSILON } = CONSTANTS;

const PARALLEL_THRESHOLD = 1 - EPSILON;

/**
 * given some `Annotations`, and the slice defined by the camera's normal
 * direction and the spacing in the normal, filter the `Annotations` which
 * is within the slice.
 *
 * @param annotations - Annotations
 * @param camera - The camera
 * @param spacingInNormalDirection - The spacing in the normal direction
 * @returns The filtered `Annotations`.
 */
export default function filterAnnotationsWithinSlice(
  annotations: Annotations,
  camera: Types.ICamera,
  spacingInNormalDirection: number
): Annotations {
  const { viewPlaneNormal } = camera;

  // The reason we use parallel normals instead of actual orientation is that
  // flipped action is done through camera API, so we can't rely on the
  // orientation (viewplaneNormal and viewUp) since even the same image and
  // same slice if flipped will have different orientation, but still rendering
  // the same slice. Instead, we choose to use the parallel normals to filter
  // the annotations and later we fine tune it with the annotation within slice
  // logic down below.
  const annotationsWithParallelNormals = annotations.filter(
    (td: Annotation) => {
      const annotationViewPlaneNormal = td.metadata.viewPlaneNormal;

      const isParallel =
        Math.abs(vec3.dot(viewPlaneNormal, annotationViewPlaneNormal)) >
        PARALLEL_THRESHOLD;

      return annotationViewPlaneNormal && isParallel;
    }
  );

  // No in plane annotations.
  if (!annotationsWithParallelNormals.length) {
    return [];
  }

  // Annotation should be within the slice, which means that it should be between
  // camera's focalPoint +/- spacingInNormalDirection.

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2;
  const { focalPoint } = camera;

  const annotationsWithinSlice = [];

  for (const annotation of annotationsWithParallelNormals) {
    const data = annotation.data;
    const point = data.handles.points[0];

    if (!annotation.isVisible) {
      continue;
    }
    // A = point
    // B = focal point
    // P = normal

    // B-A dot P  => Distance in the view direction.
    // this should be less than half the slice distance.

    const dir = vec3.create();

    vec3.sub(dir, focalPoint, point);

    const dot = vec3.dot(dir, viewPlaneNormal);

    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      annotationsWithinSlice.push(annotation);
    }
  }

  return annotationsWithinSlice;
}
