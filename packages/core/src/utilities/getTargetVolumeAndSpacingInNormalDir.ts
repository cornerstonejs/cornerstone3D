import cache from '../cache/cache.js';
import { EPSILON } from '../constants/index.js';
// import type { VolumeViewport } from '../RenderingEngine'
import {
  ICamera,
  IImageVolume,
  IVolumeViewport,
  Point3,
} from '../types/index.js';
import getSpacingInNormalDirection from './getSpacingInNormalDirection.js';
import { getVolumeLoaderSchemes } from '../loaders/volumeLoader.js';

// One EPSILON part larger multiplier
const EPSILON_PART = 1 + EPSILON;

const startsWith = (str, starts) =>
  starts === str.substring(0, Math.min(str.length, starts.length));

// Check if this is a primary volume
// For now, that means it came from some sort of image loader, but
// should be specifically designated.
const isPrimaryVolume = (volume): boolean =>
  !!getVolumeLoaderSchemes().find((scheme) =>
    startsWith(volume.volumeId, scheme)
  );

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
  actorUID: string;
} {
  const { viewPlaneNormal } = camera;
  const volumeActors = viewport.getActors();

  if (!volumeActors || !volumeActors.length) {
    return {
      spacingInNormalDirection: null,
      imageVolume: null,
      actorUID: null,
    };
  }

  const imageVolumes = volumeActors
    .map((va) => {
      // prefer the referenceUID if it is set, since it can be a derived actor
      // and the uid does not necessarily match the volumeId
      const actorUID = va.referenceId ?? va.uid;
      return cache.getVolume(actorUID);
    })
    .filter((iv) => !!iv);

  // If a volumeId is defined, set that volume as the target
  if (targetVolumeId) {
    const imageVolumeIndex = imageVolumes.findIndex(
      (iv) => iv.volumeId === targetVolumeId
    );

    const imageVolume = imageVolumes[imageVolumeIndex];
    const { uid: actorUID } = volumeActors[imageVolumeIndex];

    const spacingInNormalDirection = getSpacingInNormal(
      imageVolume,
      viewPlaneNormal,
      viewport
    );

    return { imageVolume, spacingInNormalDirection, actorUID };
  }

  if (!imageVolumes.length) {
    return {
      spacingInNormalDirection: null,
      imageVolume: null,
      actorUID: null,
    };
  }

  // Fetch volume actor with finest resolution in direction of projection.
  const smallest = {
    spacingInNormalDirection: Infinity,
    imageVolume: null,
    actorUID: null,
  };

  const hasPrimaryVolume = imageVolumes.find(isPrimaryVolume);

  for (let i = 0; i < imageVolumes.length; i++) {
    const imageVolume = imageVolumes[i];

    if (hasPrimaryVolume && !isPrimaryVolume(imageVolume)) {
      // Secondary volumes like segmentation don't count towards spacing
      continue;
    }

    const spacingInNormalDirection = getSpacingInNormal(
      imageVolume,
      viewPlaneNormal,
      viewport
    );

    // Allow for EPSILON part larger requirement to prefer earlier volumes
    // when the spacing is within a factor of EPSILON.  Use a factor because
    // that deals with very small or very large volumes effectively.
    if (
      spacingInNormalDirection * EPSILON_PART <
      smallest.spacingInNormalDirection
    ) {
      smallest.spacingInNormalDirection = spacingInNormalDirection;
      smallest.imageVolume = imageVolume;
      smallest.actorUID = volumeActors[i].uid;
    }
  }

  return smallest;
}

function getSpacingInNormal(
  imageVolume: IImageVolume,
  viewPlaneNormal: Point3,
  viewport: IVolumeViewport
): number {
  const { slabThickness } = viewport.getProperties();
  let spacingInNormalDirection = slabThickness;
  if (!slabThickness) {
    spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );
  }

  return spacingInNormalDirection;
}
