import { imageCache } from '../../../index';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';

export default function getTargetVolume(
  scene,
  camera,
  targetVolumeUID?: string
) {
  const { viewPlaneNormal } = camera;

  const volumeActors = scene.getVolumeActors();

  if (!volumeActors && !volumeActors.length) {
    // No stack to scroll through
    return { spacingInNormalDirection: null, imageVolume: null };
  }
  const numVolumeActors = volumeActors.length;

  const imageVolumes = volumeActors.map(va =>
    imageCache.getImageVolume(va.uid)
  );

  if (targetVolumeUID) {
    // If a volumeUID is defined, set that volume as the target
    const imageVolume = imageVolumes.find(iv => iv.uid === targetVolumeUID);

    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    return { imageVolume, spacingInNormalDirection };
  }

  // Fetch volume actor with finest resolution in direction of projection.

  const smallest = {
    spacingInNormalDirection: Infinity,
    imageVolume: null,
  };

  for (let i = 0; i < numVolumeActors; i++) {
    const imageVolume = imageVolumes[i];

    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    if (spacingInNormalDirection < smallest.spacingInNormalDirection) {
      smallest.spacingInNormalDirection = spacingInNormalDirection;
      smallest.imageVolume = imageVolume;
    }
  }

  return smallest;
}
