import { Types, utilities as csUtils } from '@cornerstonejs/core';
import { ActorSliceRange } from '../types';

function getVolumeSliceRangeInfo(
  viewport: Types.IVolumeViewport,
  volumeId: string
): {
  sliceRange: ActorSliceRange;
  spacingInNormalDirection: number;
  camera: Types.ICamera;
} {
  const camera = viewport.getCamera();
  const { focalPoint, viewPlaneNormal } = camera;
  const { spacingInNormalDirection, imageVolume } =
    csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera, volumeId);

  if (!imageVolume) {
    throw new Error(
      `Could not find image volume with id ${volumeId} in the viewport`
    );
  }

  const actorEntry = viewport.getActor(imageVolume.volumeId);

  if (!actorEntry) {
    console.warn('No actor found for with actorUID of', imageVolume.volumeId);
  }

  const volumeActor = actorEntry.actor as Types.VolumeActor;
  const sliceRange = csUtils.getSliceRange(
    volumeActor,
    viewPlaneNormal,
    focalPoint
  );

  return {
    sliceRange,
    spacingInNormalDirection,
    camera,
  };
}

export default getVolumeSliceRangeInfo;
