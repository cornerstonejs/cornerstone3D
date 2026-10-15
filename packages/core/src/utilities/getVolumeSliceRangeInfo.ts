import getSliceRange from './getSliceRange';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';
import type {
  ActorSliceRange,
  IVolumeViewport,
  ICamera,
  VolumeActor,
} from '../types';
import { coreLog } from './logger';

const log = coreLog.getLogger('utilities', 'getVolumeSliceRangeInfo');

/**
 * Calculates the slice range for the given volume based on its orientation
 * @param viewport - Volume viewport
 * @param volumeId - Id of one of the volumes loaded on the given viewport
 * @param useSlabThickness - If true, the slice range will be calculated
 * based on the slab thickness instead of the spacing in the normal direction
 * @returns slice range information, or null when the viewport holds no volume
 * that this function can measure
 */
function getVolumeSliceRangeInfo(
  viewport: IVolumeViewport,
  volumeId: string,
  useSlabThickness = false
): {
  sliceRange: ActorSliceRange;
  spacingInNormalDirection: number;
  camera: ICamera;
} {
  const camera = viewport.getCamera();
  const { focalPoint, viewPlaneNormal } = camera;
  const { spacingInNormalDirection, actorUID } =
    getTargetVolumeAndSpacingInNormalDir(
      viewport,
      camera,
      volumeId,
      useSlabThickness
    );

  if (!actorUID) {
    // A viewport holds no volume until a caller sets one, and a viewport of a
    // volume that no actor draws, such as a 3D viewport of an empty scene, has
    // no slice range either. A scroll of such a viewport moves nothing, so
    // report that this function cannot measure the viewport and let the caller
    // return. This is the same answer as the missing actor below, and a throw
    // here reached the user as an exception whenever a scroll arrived before a
    // volume.
    log.warn('No volume found in the viewport for the volumeId of', volumeId);
    return null;
  }

  const actorEntry = viewport.getActor(actorUID);

  if (!actorEntry) {
    log.warn('No actor found for with actorUID of', actorUID);
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
