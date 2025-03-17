import { vec3 } from 'gl-matrix';
import type {
  Point3,
  Mat3,
  ImagePlaneModule,
  ImagePixelModule,
  IImageCalibration,
} from '../types';
import { EPSILON } from '../constants';
import type IImage from '../types/IImage';
import { buildMetadata } from './buildMetadata';
import type { VOILUTFunctionType } from '../enums';

type ReturnImageDataMetadata = {
  imagePlaneModule: ImagePlaneModule;
  imagePixelModule: ImagePixelModule;
  bitsAllocated: number;
  numVoxels: number;
  numberOfComponents: number;
  origin: Point3;
  direction: Mat3;
  dimensions: Point3;
  spacing: Point3;
  voiLUTFunction: VOILUTFunctionType;
  modality: string;
  scalingFactor: number;
  calibration: IImageCalibration;
};
/**
 * Calculates image metadata based on the image object. It calculates normal
 * axis for the images, and output image metadata
 *
 * @param image - stack image containing cornerstone image
 * @param imagePlaneModule - image plane module containing image orientation information
 * @param imagePixelModule - image pixel module containing pixel data information
 * @param getNumCompsFromPhotometricInterpretation - function to get number of components from photometric interpretation
 * @returns image metadata: bitsAllocated, number of components, origin,
 *  direction, dimensions, spacing, number of voxels.
 */
export function getImageDataMetadata(image: IImage): ReturnImageDataMetadata {
  const {
    imagePlaneModule,
    imagePixelModule,
    voiLUTFunction,
    modality,
    scalingFactor,
    calibration,
  } = buildMetadata(image);

  let { rowCosines, columnCosines } = imagePlaneModule;

  // if null or undefined
  if (rowCosines == null || columnCosines == null) {
    rowCosines = [1, 0, 0] as Point3;
    columnCosines = [0, 1, 0] as Point3;
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
    imagePlaneModule.columnPixelSpacing || image.columnPixelSpacing;
  const ySpacing = imagePlaneModule.rowPixelSpacing || image.rowPixelSpacing;
  const xVoxels = image.columns;
  const yVoxels = image.rows;

  // Note: For rendering purposes, we use the EPSILON as the z spacing.
  // This is purely for internal implementation logic since we are still
  // technically rendering 3D objects with vtk.js, but the abstracted intention
  //  of the stack viewport is to render 2D images
  const zSpacing = EPSILON;
  const zVoxels = 1;

  const numberOfComponents =
    image.numberOfComponents ||
    _getNumCompsFromPhotometricInterpretation(
      imagePixelModule.photometricInterpretation
    );

  return {
    numberOfComponents,
    origin,
    direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal] as Mat3,
    dimensions: [xVoxels, yVoxels, zVoxels],
    spacing: [xSpacing, ySpacing, zSpacing],
    numVoxels: xVoxels * yVoxels * zVoxels,
    imagePlaneModule,
    imagePixelModule,
    bitsAllocated: imagePixelModule.bitsAllocated,
    voiLUTFunction,
    modality,
    scalingFactor,
    calibration,
  };
}

/**
 * Calculates number of components based on the dicom metadata
 *
 * @param photometricInterpretation - string dicom tag
 * @returns number representing number of components
 */
function _getNumCompsFromPhotometricInterpretation(
  photometricInterpretation: string
): number {
  // TODO: this function will need to have more logic later
  // see http://dicom.nema.org/medical/Dicom/current/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.2
  let numberOfComponents = 1;
  if (
    photometricInterpretation === 'RGB' ||
    photometricInterpretation.includes('YBR') ||
    photometricInterpretation === 'PALETTE COLOR'
  ) {
    numberOfComponents = 3;
  }

  return numberOfComponents;
}
