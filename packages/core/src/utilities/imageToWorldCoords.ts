import { vec3 } from 'gl-matrix';
import { metaData } from '..';
import { Point2, Point3 } from '../types';

/**
 * Given the imageId and a 2d coordinates on the image space with [0,0] being the top left corner
 * of the top left pixel, and options which includes the imageId, it returns the
 * 3d coordinates on the world space.
 * @param imageId - The image id
 * @param imageCoords - The 2d coordinates on the image
 * @returns The 3d coordinates on the world.
 *
 */
export default function imageToWorldCoords(
  imageId: string,
  imageCoords: Point2
): Point3 | undefined {
  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

  if (!imagePlaneModule) {
    throw new Error(`No imagePlaneModule found for imageId: ${imageId}`);
  }

  const {
    columnCosines,
    rowCosines,
    imagePositionPatient: origin,
  } = imagePlaneModule;

  let { columnPixelSpacing, rowPixelSpacing } = imagePlaneModule;
  // Use ||= to convert null and 0 as well as undefined to 1
  columnPixelSpacing ||= 1;
  rowPixelSpacing ||= 1;

  // calculate the image coordinates in the world space
  const imageCoordsInWorld = vec3.create();

  // move from origin in the direction of the row cosines with the amount of
  // row pixel spacing times the first element of the image coordinates vector
  vec3.scaleAndAdd(
    imageCoordsInWorld,
    origin,
    rowCosines,
    // to accommodate the [0,0] being on the top left corner of the top left pixel
    // but the origin is at the center of the top left pixel
    rowPixelSpacing * (imageCoords[0] - 0.5)
  );

  vec3.scaleAndAdd(
    imageCoordsInWorld,
    imageCoordsInWorld,
    columnCosines,
    columnPixelSpacing * (imageCoords[1] - 0.5)
  );

  return Array.from(imageCoordsInWorld) as Point3;
}
