import type { Types } from '@precisionmetrics/cornerstone-render'

/**
 * Converts `vtkVolumeActor` bounds to corners in world space.
 *
 * @param volumeActor - The `vtkVolumeActor`.
 *
 * @returns An array of the corners of the `volumeActor` in world space.
 */
export default function getVolumeActorCorners(
  volumeActor
): Array<Types.Point3> {
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
