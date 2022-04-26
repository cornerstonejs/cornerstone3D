import { vec3, vec2, mat4, vec4 } from 'gl-matrix';
import { metaData } from '..';
import { Point2, Point3 } from '../types';

type Options = {
  imageId?: string;
};

/**
 * Given the 3d coordinates on the world space, and options which includes the imageId
 * it returns the image coordinates (IJ) on the image space. The image space is
 * defined with [0,0] being on the top left corner of the first top left pixel,
 * the [1,1] being on the bottom right corner of the first top left pixel.
 * @param worldCoords - The 3d coordinates on the world.
 * @param options - options which includes the imageId
 * @returns The 2d coordinates on the image.
 *
 */
function worldToImageCoords(
  worldCoords: Point3,
  options: Options
): Point2 | undefined {
  const { imageId } = options;

  if (!imageId) {
    throw new Error('imageId is required for the worldToImageCoords function');
  }

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
    sliceThickness,
  } = imagePlaneModule;

  // The origin is the image position patient, but since image coordinates start
  // from [0,0] for the top left hand of the first pixel, and the origin is at the
  // center of the first pixel, we need to account for this.
  const newOrigin = vec3.create();

  vec3.scaleAndAdd(newOrigin, origin, columnCosines, -columnPixelSpacing / 2);
  vec3.scaleAndAdd(newOrigin, newOrigin, rowCosines, -rowPixelSpacing / 2);

  // Translation matrix for the world to image coordinates
  const translationMatrix = mat4.create();
  mat4.fromTranslation(
    translationMatrix,
    vec3.fromValues(newOrigin[0], newOrigin[1], newOrigin[2])
  );

  // The normal is the cross product of the rowCosines and the columnCosines.
  const normal = vec3.create();
  vec3.cross(normal, rowCosines, columnCosines);

  // The rotation matrix for the world to image coordinates
  const rotationMatrix = mat4.fromValues(
    rowCosines[0],
    rowCosines[1],
    rowCosines[2],
    0,
    columnCosines[0],
    columnCosines[1],
    columnCosines[2],
    0,
    normal[0],
    normal[1],
    normal[2],
    0,
    0,
    0,
    0,
    1
  );

  // The scale matrix for the world to image coordinates
  const scale = mat4.create();
  mat4.fromScaling(
    scale,
    vec3.fromValues(columnPixelSpacing, rowPixelSpacing, sliceThickness)
  );

  // The matrix is the concatenation of the translation, rotation and scale
  const matrix = mat4.create();
  mat4.multiply(matrix, translationMatrix, rotationMatrix);
  mat4.multiply(matrix, matrix, scale);

  // The inverse matrix
  const inverseMatrix = mat4.create();
  mat4.invert(inverseMatrix, matrix);

  // The world coordinates are transformed by the inverse matrix
  const transformedWorldCoords = vec4.create();
  vec4.transformMat4(
    transformedWorldCoords,
    vec4.fromValues(worldCoords[0], worldCoords[1], worldCoords[2], 1),
    inverseMatrix
  );

  // The transformed world coordinates are divided by the last element of the
  // transformed world coordinates to get the image coordinates.
  const imageCoords = vec2.fromValues(
    transformedWorldCoords[0] / transformedWorldCoords[3],
    transformedWorldCoords[1] / transformedWorldCoords[3]
  );

  if (
    imageCoords[0] < 0 ||
    imageCoords[0] >= columns ||
    imageCoords[1] < 0 ||
    imageCoords[1] >= rows
  ) {
    throw new Error(
      `The image coordinates are outside of the image, imageCoords: ${imageCoords}`
    );
  }

  return Array.from(imageCoords) as Point2;
}

export default worldToImageCoords;
