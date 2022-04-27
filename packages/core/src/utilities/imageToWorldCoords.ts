import { vec3 } from 'gl-matrix';
import { metaData } from '..';
import { Point2, Point3 } from '../types';

type Options = {
  imageId?: string;
};

/**
 * Given the 2d coordinates on the image space with [0,0] being the top left corner
 * of the top left pixel, and options which includes the imageId, it returns the
 * 3d coordinates on the world space.
 * @param imageCoords - The 2d coordinates on the image
 * @param options - options which includes the imageId
 * @returns The 3d coordinates on the world.
 *
 */
export default function imageToWorldCoords(
  imageCoords: Point2,
  options: Options
): Point3 | undefined {
  const { imageId } = options;

  if (!imageId) {
    throw new Error('imageId is required for the imageToWorldCoords function');
  }

  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

  if (!imagePlaneModule) {
    throw new Error(`No imagePlaneModule found for imageId: ${imageId}`);
  }

  const {
    columnCosines,
    columnPixelSpacing,
    rowCosines,
    rowPixelSpacing,
    imagePositionPatient: origin,
  } = imagePlaneModule;

  // calculate the image coordinates in the world space
  const imageCoordsInWorld = vec3.create();

  // move from origin in the direction of the row cosines with the amount of
  // row pixel spacing times the first element of the image coordinates vector
  vec3.scaleAndAdd(
    imageCoordsInWorld,
    origin,
    rowCosines,
    // to accommodate the [0,0] being on the top left corner of the first top left pixel
    // but the origin is at the center of the first top left pixel
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
