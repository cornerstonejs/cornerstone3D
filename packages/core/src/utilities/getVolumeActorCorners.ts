import { Point3 } from '../types';

/**
 * Converts `vtkVolumeActor` bounds to corners in world space.
 *
 * @param volumeActor - The `vtkVolumeActor`.
 *
 * @returns An array of the corners of the `volumeActor` in world space.
 */
export default function getVolumeActorCorners(volumeActor): Array<Point3> {
  const imageData = volumeActor.getMapper().getInputData();
  const bounds = imageData.extentToBounds(imageData.getExtent());

  return [
    [bounds[0], bounds[2], bounds[4]],
    [bounds[0], bounds[2], bounds[5]],
    [bounds[0], bounds[3], bounds[4]],
    [bounds[0], bounds[3], bounds[5]],
    [bounds[1], bounds[2], bounds[4]],
    [bounds[1], bounds[2], bounds[5]],
    [bounds[1], bounds[3], bounds[4]],
    [bounds[1], bounds[3], bounds[5]],
  ];
}
