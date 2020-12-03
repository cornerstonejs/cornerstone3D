/**
 *
 * @param {object} volumeActor Converts volumeActor bounds to corners.
 */
export default function getVolumeActorCorners(
  volumeActor
): Array<Array<number>> {
  const bounds = volumeActor.getMapper().getBounds();

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
