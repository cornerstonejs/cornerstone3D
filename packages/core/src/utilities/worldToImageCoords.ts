import { vec3 } from 'gl-matrix';
import { metaData } from '..';
import { Point2, Point3 } from '../types';

/**
 * Given the imageId, and 3d coordinates on the world space, it returns the continuos
 * image coordinates (IJ) on the image space. The image space is
 * defined with [0,0] being on the top left corner of the top left pixel,
 * the [1,1] being on the bottom right corner of the top left pixel.
 * @param imageId - The image id
 * @param worldCoords - The 3d coordinates on the world.
 * @returns The 2d coordinates on the image.
 *
 */
function worldToImageCoords(
  imageId: string,
  worldCoords: Point3
): Point2 | undefined {
  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

  if (!imagePlaneModule) {
    throw new Error(`No imagePlaneModule found for imageId: ${imageId}`);
  }

  // For the image coordinates we need to calculate the transformation matrix
  // from the world coordinates to the image coordinates.

  const {
    columnCosines,
    columnPixelSpacing,
    rowCosines,
    rowPixelSpacing,
    imagePositionPatient: origin,
    rows,
    columns,
  } = imagePlaneModule;

  // The origin is the image position patient, but since image coordinates start
  // from [0,0] for the top left hand of the first pixel, and the origin is at the
  // center of the first pixel, we need to account for this.
  const newOrigin = vec3.create();

  vec3.scaleAndAdd(newOrigin, origin, columnCosines, -columnPixelSpacing / 2);
  vec3.scaleAndAdd(newOrigin, newOrigin, rowCosines, -rowPixelSpacing / 2);

  // Get the subtraction vector from the origin to the world coordinates
  const sub = vec3.create();
  vec3.sub(sub, worldCoords, newOrigin);

  // Projected distance of the sub vector onto the rowCosines
  const rowDistance = vec3.dot(sub, rowCosines);

  // Projected distance of the sub vector onto the columnCosines
  const columnDistance = vec3.dot(sub, columnCosines);

  const imageCoords = [
    rowDistance / rowPixelSpacing,
    columnDistance / columnPixelSpacing,
  ];

  return imageCoords as Point2;
}

export default worldToImageCoords;
