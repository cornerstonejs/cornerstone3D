import { vec3 } from 'gl-matrix';
import { CONSTANTS, metaData } from '@cornerstonejs/core';
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
export function filterAnnotationsWithinSamePlane(
  annotations: Annotations,
  camera: Types.ICamera
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
      let annotationViewPlaneNormal = td.metadata.viewPlaneNormal;

      if (!annotationViewPlaneNormal) {
        // This code is run to set the annotation view plane normal
        // for historical data which was saved without the normal.
        const { referencedImageId } = td.metadata;
        const { imageOrientationPatient } = metaData.get(
          'imagePlaneModule',
          referencedImageId
        );
        const rowCosineVec = vec3.fromValues(
          imageOrientationPatient[0],
          imageOrientationPatient[1],
          imageOrientationPatient[2]
        );

        const colCosineVec = vec3.fromValues(
          imageOrientationPatient[3],
          imageOrientationPatient[4],
          imageOrientationPatient[5]
        );

        annotationViewPlaneNormal = vec3.create() as Types.Point3;

        vec3.cross(annotationViewPlaneNormal, rowCosineVec, colCosineVec);
        td.metadata.viewPlaneNormal = annotationViewPlaneNormal;
      }
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

  return annotationsWithParallelNormals;
}
