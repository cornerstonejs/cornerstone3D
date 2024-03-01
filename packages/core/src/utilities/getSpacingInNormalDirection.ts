import { mat3, vec3 } from 'gl-matrix';
import { IImageVolume, Point3 } from '../types';

/**
 * Given an `imageVolume` and a normal direction (`viewPlaneNormal`), calculates
 * the spacing between voxels in the normal direction. If (`viewPlaneNormal`) is
 * parallel to one of the directions you will obtain the spacing in that direction.
 * Otherwise each of the `imageVolume`'s directions are projected onto the volume,
 * so that you obtain a spacing of the order of "seeing a new set of voxels if the camera where to dolly".
 *
 * @param imageVolume - The image volume to calculate the spacing in the normal direction.
 * @param viewPlaneNormal - The normal direction of the view plane.
 * @returns
 */
export default function getSpacingInNormalDirection(
  imageVolume: IImageVolume | { direction: mat3; spacing: Point3 },
  viewPlaneNormal: Point3
): number {
  const { direction, spacing } = imageVolume;

  // Calculate size of spacing vector in normal direction
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const kVector = direction.slice(6, 9) as Point3;

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
