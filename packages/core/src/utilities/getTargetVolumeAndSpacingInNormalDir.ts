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
  uid: string;
} {
  const { viewPlaneNormal } = camera;
  const volumeActors = viewport.getActors();

  if (!volumeActors || !volumeActors.length) {
    return { spacingInNormalDirection: null, imageVolume: null, uid: null };
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
    const imageVolumeIndex = imageVolumes.findIndex(
      (iv) => iv.volumeId === targetVolumeId
    );

    const imageVolume = imageVolumes[imageVolumeIndex];
    const { uid } = volumeActors[imageVolumeIndex];
    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    return { imageVolume, spacingInNormalDirection, uid };
  }

  if (!imageVolumes.length) {
    return { spacingInNormalDirection: null, imageVolume: null, uid: null };
  }

  // Fetch volume actor with finest resolution in direction of projection.
  const smallest = {
    spacingInNormalDirection: Infinity,
    imageVolume: null,
    uid: null,
  };

  for (let i = 0; i < imageVolumes.length; i++) {
    const imageVolume = imageVolumes[i];

    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );

    // Allow for 1/1000 part larger requirement to prefer earlier volumes
    // when the spacing is all essentially the same.
    if (spacingInNormalDirection * 1.001 < smallest.spacingInNormalDirection) {
      smallest.spacingInNormalDirection = spacingInNormalDirection;
      smallest.imageVolume = imageVolume;
      smallest.uid = volumeActors[i].uid;
    }
  }

  return smallest;
}
