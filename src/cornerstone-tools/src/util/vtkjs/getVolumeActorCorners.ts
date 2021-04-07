import { Point3 } from '../../types'

/**
 * @function getVolumeActorCorners Converts `vtkVolumeActor` bounds to corners
 * in world space.
 *
 * @param {object} volumeActor The `vtkVolumeActor`.
 *
 * @returns {Array<Point3>} An array of the corners of the `volumeActor` in world space.
 */
export default function getVolumeActorCorners(volumeActor): Array<Point3> {
  const bounds = volumeActor.getMapper().getBounds()

  return [
    [bounds[0], bounds[2], bounds[4]],
    [bounds[0], bounds[2], bounds[5]],
    [bounds[0], bounds[3], bounds[4]],
    [bounds[0], bounds[3], bounds[5]],
    [bounds[1], bounds[2], bounds[4]],
    [bounds[1], bounds[2], bounds[5]],
    [bounds[1], bounds[3], bounds[4]],
    [bounds[1], bounds[3], bounds[5]],
  ]
}
