import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import getVolumeActorCorners from './getVolumeActorCorners';
import type { VolumeActor, Point3, ActorSliceRange } from '../types';

const isOne = (v) => Math.abs(v) > 0.99 && Math.abs(v) < 1.01;
const isUnit = (v, off) =>
  isOne(v[off]) || isOne(v[off + 1]) || isOne(v[off + 2]);

const isOrthonormal = (v) => isUnit(v, 0) && isUnit(v, 3) && isUnit(v, 6);

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
  volumeActor: VolumeActor,
  viewPlaneNormal: Point3,
  focalPoint: Point3
): ActorSliceRange {
  const imageData = volumeActor.getMapper().getInputData();
  let corners;
  const direction = imageData.getDirection();

  if (isOrthonormal(direction)) {
    // This logic is only valid when the IJK vectors are unit vectors
    corners = getVolumeActorCorners(volumeActor);
  } else {
    // This logic works for both unit and non-unit vectors, but is slower
    const [dx, dy, dz] = imageData.getDimensions();
    const cornersIdx = [
      [0, 0, 0],
      [dx - 1, 0, 0],
      [0, dy - 1, 0],
      [dx - 1, dy - 1, 0],
      [0, 0, dz - 1],
      [dx - 1, 0, dz - 1],
      [0, dy - 1, dz - 1],
      [dx - 1, dy - 1, dz - 1],
    ];
    corners = cornersIdx.map((it) => imageData.indexToWorld(it));
  }
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

  return {
    min: minX,
    max: maxX,
    current: currentSlice,
    actor: volumeActor,
    viewPlaneNormal,
    focalPoint,
  };
}
