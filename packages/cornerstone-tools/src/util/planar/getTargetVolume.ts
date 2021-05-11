import { cache } from '@ohif/cornerstone-render'
import getSpacingInNormalDirection from './getSpacingInNormalDirection'

/**
 * @function getTargetVolume Given a scene and camera, find the target volume for a tool.
 *
 * @param {object} scene
 * @param {object} camera
 * @param {string} [targetVolumeUID] If a target volumeUID is given that volume
 * is forced to be used.
 *
 * @returns {object} The imageVolume specified or the volume with the smallest
 * spacing in the normal direction of the camera.
 */
export default function getTargetVolume(
  scene,
  camera,
  targetVolumeUID?: string
) {
  const { viewPlaneNormal } = camera

  const volumeActors = scene.getVolumeActors()

  if (!volumeActors && !volumeActors.length) {
    // No stack to scroll through
    return { spacingInNormalDirection: null, imageVolume: null }
  }
  const numVolumeActors = volumeActors.length

  const imageVolumes = volumeActors.map((va) => cache.getVolume(va.uid))

  if (targetVolumeUID) {
    // If a volumeUID is defined, set that volume as the target
    const imageVolume = imageVolumes.find((iv) => iv.uid === targetVolumeUID)

    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    )

    return { imageVolume, spacingInNormalDirection }
  }

  // Fetch volume actor with finest resolution in direction of projection.

  const smallest = {
    spacingInNormalDirection: Infinity,
    imageVolume: null,
  }

  for (let i = 0; i < numVolumeActors; i++) {
    const imageVolume = imageVolumes[i]

    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    )

    if (spacingInNormalDirection < smallest.spacingInNormalDirection) {
      smallest.spacingInNormalDirection = spacingInNormalDirection
      smallest.imageVolume = imageVolume
    }
  }

  return smallest
}
