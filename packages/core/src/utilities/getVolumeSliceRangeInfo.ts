import getSliceRange from './getSliceRange';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';
import {
  ActorSliceRange,
  IVolumeViewport,
  ICamera,
  VolumeActor,
} from '../types';

/**
 * Calculates the slice range for the given volume based on its orientation
 * @param viewport - Volume viewport
 * @param volumeId - Id of one of the volumes loaded on the given viewport
 * @returns slice range information
 */
function getVolumeSliceRangeInfo(
  viewport: IVolumeViewport,
  volumeId: string
): {
  sliceRange: ActorSliceRange;
  spacingInNormalDirection: number;
  camera: ICamera;
} {
  const camera = viewport.getCamera();
  const { focalPoint, viewPlaneNormal } = camera;
  const { spacingInNormalDirection, actorUID } =
    getTargetVolumeAndSpacingInNormalDir(viewport, camera, volumeId);

  if (!actorUID) {
    throw new Error(
      `Could not find image volume with id ${volumeId} in the viewport`
    );
  }

  const actorEntry = viewport.getActor(actorUID);

  if (!actorEntry) {
    console.warn('No actor found for with actorUID of', actorUID);
    return null;
  }

  const volumeActor = actorEntry.actor as VolumeActor;
  const sliceRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint);

  return {
    sliceRange,
    spacingInNormalDirection,
    camera,
  };
}

export default getVolumeSliceRangeInfo;
