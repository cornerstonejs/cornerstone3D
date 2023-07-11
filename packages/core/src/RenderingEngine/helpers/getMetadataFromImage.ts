import {
  IImage,
  Point3,
  Mat3,
  ImagePlaneModule,
  ImagePixelModule,
} from '../../types';
import getImagePlaneModule from './getImagePlaneModule';
import { vec3 } from 'gl-matrix';
import getNumCompsFromPhotometricInterpretation from './getNumCompsFromPhotometricInterpretation';
import getImagePixelModule from './getImagePixelModule';

const EPSILON = 1;

export interface ImageDataMetaData {
  bitsAllocated: number;
  numComps: number;
  origin: Point3;
  direction: Mat3;
  dimensions: Point3;
  spacing: Point3;
  numVoxels: number;
  imagePlaneModule: ImagePlaneModule;
  imagePixelModule: ImagePixelModule;
}

export function getMetadataFromImagePlaneModule(
  image: IImage,
  imagePlaneModule: ImagePlaneModule
) {
  let rowCosines, columnCosines;

  rowCosines = <Point3>imagePlaneModule.rowCosines;
  columnCosines = <Point3>imagePlaneModule.columnCosines;

  // if null or undefined
  if (rowCosines == null || columnCosines == null) {
    rowCosines = <Point3>[1, 0, 0];
    columnCosines = <Point3>[0, 1, 0];
  }

  const rowCosineVec = vec3.fromValues(
    rowCosines[0],
    rowCosines[1],
    rowCosines[2]
  );
  const colCosineVec = vec3.fromValues(
    columnCosines[0],
    columnCosines[1],
    columnCosines[2]
  );
  const scanAxisNormal = vec3.create();
  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

  let origin = imagePlaneModule.imagePositionPatient;
  // if null or undefined
  if (origin == null) {
    origin = [0, 0, 0];
  }

  const xSpacing =
    imagePlaneModule.columnPixelSpacing || image?.columnPixelSpacing;
  const ySpacing = imagePlaneModule.rowPixelSpacing || image?.rowPixelSpacing;
  const xVoxels = imagePlaneModule.columns || image?.columns;
  const yVoxels = imagePlaneModule.rows || image?.rows;

  // Note: For rendering purposes, we use the EPSILON as the z spacing.
  // This is purely for internal implementation logic since we are still
  // technically rendering 3D objects with vtk.js, but the abstracted intention
  //  of the stack viewport is to render 2D images
  const zSpacing = EPSILON;
  const zVoxels = 1;
  return {
    origin,
    direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal] as Mat3,
    dimensions: [xVoxels, yVoxels, zVoxels],
    spacing: [xSpacing, ySpacing, zSpacing],
    numVoxels: xVoxels * yVoxels * zVoxels,
  };
}

/**
 * Calculates image metadata based on the image object. It calculates normal
 * axis for the images, and output image metadata
 *
 * @param image - stack image containing cornerstone image
 * @returns image metadata: bitsAllocated, number of components, origin,
 *  direction, dimensions, spacing, number of voxels.
 */
export function getMetadataFromImage(image: IImage): ImageDataMetaData {
  const { imagePlaneModule } = getImagePlaneModule(
    image?.referenceImageId || image.imageId
  );
  const imagePlaneModuleMetadata = getMetadataFromImagePlaneModule(
    image,
    imagePlaneModule
  );
  const imagePixelModule = getImagePixelModule(image);
  const numComps =
    image.numComps ||
    getNumCompsFromPhotometricInterpretation(
      imagePixelModule.photometricInterpretation
    );
  return {
    bitsAllocated: imagePixelModule.bitsAllocated,
    numComps,
    origin: imagePlaneModuleMetadata.origin,
    direction: imagePlaneModuleMetadata.direction,
    dimensions: <Point3>imagePlaneModuleMetadata.dimensions,
    spacing: <Point3>imagePlaneModuleMetadata.spacing,
    numVoxels: imagePlaneModuleMetadata.numVoxels,
    imagePlaneModule,
    imagePixelModule,
  };
}
