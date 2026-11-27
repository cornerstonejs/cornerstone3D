import type { ImageSliceData, IVolumeViewport, VolumeActor } from '../types';
import getSliceRange from './getSliceRange';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';
import getVolumeSliceGrid, { getSliceGridIndex } from './getVolumeSliceGrid';
import { coreLog } from './logger';

const log = coreLog.getLogger(
  'utilities',
  'getImageSliceDataForVolumeViewport'
);

/**
 * It calculates the number of slices and the current slice index for a given
 * Volume viewport
 * @param viewport - volume viewport
 * @returns An object with two properties: numberOfSlices and imageIndex.
 */
function getImageSliceDataForVolumeViewport(
  viewport: IVolumeViewport
): ImageSliceData {
  const camera = viewport.getCamera();

  const { spacingInNormalDirection, imageVolume } =
    getTargetVolumeAndSpacingInNormalDir(viewport, camera);

  if (!imageVolume) {
    return;
  }

  const { viewPlaneNormal, focalPoint } = camera;

  const actorEntry = viewport
    .getActors()
    .find(
      (a) =>
        a.referencedId === imageVolume.volumeId ||
        a.uid === imageVolume.volumeId
    );

  if (!actorEntry) {
    log.warn('No actor found for with actorUID of', imageVolume.volumeId);
  }

  const volumeActor = actorEntry.actor as VolumeActor;
  const sliceRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint);

  const { min, max, current } = sliceRange;
  const grid = getVolumeSliceGrid(min, max, spacingInNormalDirection);
  const numberOfSlices = grid.maxIndex + 1;
  // The same index as the scroll and the planar viewport (VSN-I-4).
  const imageIndex = getSliceGridIndex(grid, current);

  return {
    numberOfSlices,
    imageIndex,
  };
}

export default getImageSliceDataForVolumeViewport;
