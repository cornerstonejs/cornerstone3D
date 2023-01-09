import cache from '../cache/cache';
// import type { VolumeViewport } from '../RenderingEngine'
import { ICamera, IImageVolume, IVolumeViewport } from '../types';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';

/**
 * Given a volume viewport and camera, find the target volume.
 * The imageVolume is retrieved from cache for the specified targetVolumeId or
 * in case it is not provided, it chooses the volumeId on the viewport (there
 * might be more than one in case of fusion) that has the finest resolution in the
 * direction of view (normal).
 *
 * @param viewport - volume viewport
 * @param camera - current camera
 * @param targetVolumeId - If a target volumeId is given that volume
 * is forced to be used.
 *
 * @returns An object containing the imageVolume and spacingInNormalDirection.
 *
 */
export default function getTargetVolumeAndSpacingInNormalDir(
  viewport: IVolumeViewport,
  camera: ICamera,
  targetVolumeId?: string
): {
  imageVolume: IImageVolume;
  spacingInNormalDirection: number;
} {
  const { viewPlaneNormal } = camera;
  const volumeActors = viewport.getActors();

  if (!volumeActors || !volumeActors.length) {
    return { spacingInNormalDirection: null, imageVolume: null };
  }

  const imageVolumes = volumeActors
    .map((va) => {
      // prefer the referenceUID if it is set, since it can be a derived actor
      // and the uid does not necessarily match the volumeId
      const uid = va.referenceId ?? va.uid;
      return cache.getVolume(uid);
    })
    .filter((iv) => !!iv);

  // If a volumeId is defined, set that volume as the target
  if (targetVolumeId) {
    const imageVolume = imageVolumes.find(
      (iv) => iv.volumeId === targetVolumeId
    );

    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    return { imageVolume, spacingInNormalDirection };
  }

  if (!imageVolumes.length) {
    return { spacingInNormalDirection: null, imageVolume: null };
  }

  // Fetch volume actor with finest resolution in direction of projection.
  const smallest = {
    spacingInNormalDirection: Infinity,
    imageVolume: null,
  };

  for (let i = 0; i < imageVolumes.length; i++) {
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
