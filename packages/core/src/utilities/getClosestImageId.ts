import { vec3 } from 'gl-matrix';
import * as metaData from '../metaData';
import type { IImageVolume, Point3 } from '../types';

import getSpacingInNormalDirection from './getSpacingInNormalDirection';
import { EPSILON } from '../constants';

/**
 * Given an image, a point in space and the viewPlaneNormal it returns the
 * closest imageId of the image volume that is within half voxel spacing
 * of the point in space.
 * @param imageVolume - The image volume
 * @param worldPos - The position in the world coordinate system (from mouse click)
 * @param viewPlaneNormal - The normal vector of the viewport
 *
 * @returns The imageId for the tool.
 */
export default function getClosestImageId(
  imageVolume: IImageVolume,
  worldPos: Point3,
  viewPlaneNormal: Point3
): string {
  if (!imageVolume) {
    return;
  }

  const { direction, imageIds } = imageVolume;

  if (!imageIds || !imageIds.length) {
    return;
  }

  // 1. Get ScanAxis vector
  const kVector = direction.slice(6, 9);

  // 2. Check if scanAxis is not parallel to camera viewPlaneNormal
  const dotProducts = vec3.dot(kVector as Point3, <vec3>viewPlaneNormal);

  // 2.a if imagePlane is not parallel to the camera: tool is not drawn on an
  // imaging plane, return
  if (Math.abs(dotProducts) < 1 - EPSILON) {
    return;
  }

  // 3. Calculate Spacing the in the normal direction, this will get used to
  // check whether we are withing a slice
  const spacingInNormalDirection = getSpacingInNormalDirection(
    imageVolume,
    viewPlaneNormal
  );

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2;

  // 4. Iterate over all imageIds and check if the tool point (worldPos) is
  // withing one of the slices defined by an imageId
  let imageIdForTool;
  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i];

    // 4.a Get metadata for the imageId
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);

    // 4.b Calculate the direction vector from annotation. point to the first voxel
    // of this image defined by imageId
    const dir = vec3.create();
    vec3.sub(dir, worldPos, imagePositionPatient);

    // 4.c Calculate the distance between the vector above and the viewplaneNormal
    // i.e., projected distance
    const dot = vec3.dot(dir, viewPlaneNormal);

    // 4.d If the distance is withing range, return the imageId
    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      imageIdForTool = imageId;
    }
  }

  return imageIdForTool;
}
