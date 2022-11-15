import { ImageSliceData, IVolumeViewport, VolumeActor } from '../types';
import getSliceRange from './getSliceRange';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';

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
        a.referenceId === imageVolume.volumeId || a.uid === imageVolume.volumeId
    );

  if (!actorEntry) {
    console.warn('No actor found for with actorUID of', imageVolume.volumeId);
  }

  const volumeActor = actorEntry.actor as VolumeActor;
  const sliceRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint);

  const { min, max, current } = sliceRange;

  // calculate number of steps from min to max with current normal spacing in direction
  const numberOfSlices = Math.round((max - min) / spacingInNormalDirection) + 1;

  // calculate the imageIndex based on min, max, current
  let imageIndex = ((current - min) / (max - min)) * numberOfSlices;
  imageIndex = Math.floor(imageIndex);

  // Clamp imageIndex
  if (imageIndex > numberOfSlices - 1) {
    imageIndex = numberOfSlices - 1;
  } else if (imageIndex < 0) {
    imageIndex = 0;
  }

  return {
    numberOfSlices,
    imageIndex,
  };
}

export default getImageSliceDataForVolumeViewport;
