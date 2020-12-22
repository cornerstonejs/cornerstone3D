import {Point3} from '../../types'
import { vec3 } from 'gl-matrix';

/**
 * @function getSpacingInNormalDirection Given an `imageVolume` and a
 * normal direction (`viewPlaneNormal`), calculates the spacing between voxels
 * in the normal direction. If (`viewPlaneNormal`) is parallell to one of the
 * directions you will obtain the spacing in that direction. Otherwise each of
 * the `imageVolume`'s directions are projected onto the volume, so that you obtain
 * a spacing of the order of "seeing a new set of voxels if the camera where to dolly".
 *
 * @param {object} imageVolume
 * @param {Point3} viewPlaneNormal
 * @returns
 */
export default function getSpacingInNormalDirection(
  imageVolume,
  viewPlaneNormal: Point3
) {
  const { direction, spacing } = imageVolume;

  // Calculate size of spacing vector in normal direction
  const iVector = direction.slice(0, 3);
  const jVector = direction.slice(3, 6);
  const kVector = direction.slice(6, 9);

  const dotProducts = [
    vec3.dot(iVector, <vec3>viewPlaneNormal),
    vec3.dot(jVector, <vec3>viewPlaneNormal),
    vec3.dot(kVector, <vec3>viewPlaneNormal),
  ];

  const projectedSpacing = vec3.create();

  vec3.set(
    projectedSpacing,
    dotProducts[0] * spacing[0],
    dotProducts[1] * spacing[1],
    dotProducts[2] * spacing[2]
  );

  const spacingInNormalDirection = vec3.length(projectedSpacing);

  return spacingInNormalDirection;
}
