import { IVolumeViewport } from '../types';
import getSliceRange from './getSliceRange';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';

/**
 * It calculates the number of slices and the current slice index for a given
 * Volume viewport
 * @param viewport - volume viewport
 * @returns An object with two properties: numberOfSlices and imageIndex.
 */
function getImageSliceDataForVolumeViewport(viewport: IVolumeViewport): {
  numberOfSlices: number;
  imageIndex: number;
} {
  const camera = viewport.getCamera();

  const { spacingInNormalDirection, imageVolume } =
    getTargetVolumeAndSpacingInNormalDir(viewport, camera);

  if (!imageVolume) {
    return;
  }

  const { viewPlaneNormal, focalPoint } = camera;
  const actor = viewport.getActor(imageVolume.volumeId);

  if (!actor) {
    console.warn('No actor found for with actorUID of', imageVolume.volumeId);
  }

  const { volumeActor } = actor;
  const sliceRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint);

  const { min, max, current } = sliceRange;

  // calculate number of steps from min to max with current normal spacing in direction
  const numberOfSlices = Math.floor((max - min) / spacingInNormalDirection + 1);

  // calculate the imageIndex based on min, max, current
  const imageIndex = Math.round(
    ((current - min) / (max - min)) * numberOfSlices
  );

  return {
    numberOfSlices,
    imageIndex,
  };
}

export default getImageSliceDataForVolumeViewport;
