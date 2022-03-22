import { vec3 } from 'gl-matrix'
import { utilities as csUtils } from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'
import { Annotations, Annotation } from '../../types'

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
  const { viewPlaneNormal } = camera
  const annotationsWithSameNormal = annotations.filter((td: Annotation) => {
    const annotationViewPlaneNormal = td.metadata.viewPlaneNormal
    return csUtils.isEqual(annotationViewPlaneNormal, viewPlaneNormal)
  })

  // No in plane annotations.
  if (!annotationsWithSameNormal.length) {
    return []
  }

  // Annotation should be within the slice, which means that it should be between
  // camera's focalPoint +/- spacingInNormalDirection.

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2
  const { focalPoint } = camera

  const annotationsWithinSlice = []

  for (const annotation of annotationsWithSameNormal) {
    const data = annotation.data
    const point = data.handles.points[0]

    // A = point
    // B = focal point
    // P = normal

    // B-A dot P  => Distance in the view direction.
    // this should be less than half the slice distance.

    const dir = vec3.create()

    vec3.sub(dir, focalPoint, point)

    const dot = vec3.dot(dir, viewPlaneNormal)

    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      annotationsWithinSlice.push(annotation)
    }
  }

  return annotationsWithinSlice
}
