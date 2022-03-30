import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';

/**
 * Given a `vtkVolumeActor`, and a normal direction,
 * calculate the range of slices in the focal normal direction that encapsulate
 * the volume. Also project the `focalPoint` onto this range.
 *
 * @param volumeActor - The `vtkVolumeActor`.
 * @param viewPlaneNormal - The normal to the camera view.
 * @param focalPoint - The focal point of the camera.
 *
 * @returns an object containing the `min`, `max` and `current`
 * positions in the normal direction.
 */
export default function getSliceRange(
  volumeActor: Types.VolumeActor,
  viewPlaneNormal: Types.Point3,
  focalPoint: Types.Point3
): { min: number; max: number; current: number } {
  const corners = csUtils.getVolumeActorCorners(volumeActor);

  // Get rotation matrix from normal to +X (since bounds is aligned to XYZ)
  const transform = vtkMatrixBuilder
    .buildFromDegree()
    .identity()
    .rotateFromDirections(viewPlaneNormal, [1, 0, 0]);

  corners.forEach((pt) => transform.apply(pt));

  const transformedFocalPoint = [...focalPoint];

  transform.apply(transformedFocalPoint);

  const currentSlice = transformedFocalPoint[0];

  // range is now maximum X distance
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = corners[i][0];
    if (x > maxX) {
      maxX = x;
    }
    if (x < minX) {
      minX = x;
    }
  }

  return { min: minX, max: maxX, current: currentSlice };
}
