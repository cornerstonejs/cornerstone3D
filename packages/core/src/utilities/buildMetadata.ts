import * as metaData from '../metaData';
import { MetadataModules, VOILUTFunctionType } from '../enums';
import type IImage from '../types/IImage';
import type { ImagePlaneModule, ImagePixelModule } from '../types';
import type IImageCalibration from '../types/IImageCalibration';

export interface BuildMetadataResult {
  scalingFactor: number;
  imagePlaneModule: ImagePlaneModule;
  voiLUTFunction: VOILUTFunctionType;
  modality: string;
  calibration: IImageCalibration;
  imagePixelModule: {
    bitsAllocated: number;
    bitsStored: number;
    samplesPerPixel: number;
    highBit: number;
    photometricInterpretation: string;
    pixelRepresentation: number;
    windowWidth: number;
    windowCenter: number;
    modality: string;
    voiLUTFunction: VOILUTFunctionType;
  };
}

/**
 * Gets a valid VOI LUT function from the provided value, defaulting to LINEAR if invalid
 * @param voiLUTFunction - The VOI LUT function to validate
 * @returns A valid VOI LUT function
 */
export function getValidVOILUTFunction(
  voiLUTFunction: VOILUTFunctionType | unknown
): VOILUTFunctionType {
  if (
    !Object.values(VOILUTFunctionType).includes(
      voiLUTFunction as VOILUTFunctionType
    )
  ) {
    return VOILUTFunctionType.LINEAR;
  }
  return voiLUTFunction as VOILUTFunctionType;
}

/**
 * Creates default values for imagePlaneModule if values are undefined
 * @param imageId - The image ID to get the plane module for
 * @returns The image plane module with default values if needed
 */
export function getImagePlaneModule(imageId: string): ImagePlaneModule {
  const imagePlaneModule = metaData.get(MetadataModules.IMAGE_PLANE, imageId);

  if (imagePlaneModule.usingDefaultValues !== undefined) {
    // If the usingDefault values is set, then everything is already available
    return imagePlaneModule;
  }
  if (
    imagePlaneModule.columnPixelSpacing &&
    imagePlaneModule.rowPixelSpacing &&
    imagePlaneModule.columnCosines &&
    imagePlaneModule.rowCosines &&
    imagePlaneModule.imagePositionPatient &&
    imagePlaneModule.imageOrientationPatient
  ) {
    // Everything is specifically provided, assume it is correct already.
    return imagePlaneModule;
  }
  const newImagePlaneModule: ImagePlaneModule = {
    ...imagePlaneModule,
    usingDefaultValues: true,
  };

  newImagePlaneModule.columnPixelSpacing ||= 1;
  newImagePlaneModule.rowPixelSpacing ||= 1;
  newImagePlaneModule.columnCosines ||= [0, 1, 0];
  newImagePlaneModule.rowCosines ||= [1, 0, 0];
  newImagePlaneModule.imagePositionPatient ||= [0, 0, 0];
  newImagePlaneModule.imageOrientationPatient ||= new Float32Array([
    1, 0, 0, 0, 1, 0,
  ]);

  return newImagePlaneModule;
}

/**
 * Calibrates the image plane module if necessary
 * @param imageId - The image ID
 * @param imagePlaneModule - The image plane module to calibrate
 * @param currentCalibration - The current calibration
 * @returns The calibrated image plane module and calibration event if updated
 */
export function calibrateImagePlaneModule(
  imageId: string,
  imagePlaneModule: ImagePlaneModule,
  currentCalibration: IImageCalibration
): {
  imagePlaneModule: ImagePlaneModule;
  hasPixelSpacing: boolean;
  calibrationEvent?: {
    scale: number;
    calibration: IImageCalibration;
  };
} {
  const calibration = metaData.get('calibratedPixelSpacing', imageId);
  const isUpdated = currentCalibration !== calibration;
  const { scale } = calibration || {};
  const hasPixelSpacing = scale > 0 || imagePlaneModule.rowPixelSpacing > 0;
  imagePlaneModule.calibration = calibration;

  if (!isUpdated) {
    return { imagePlaneModule, hasPixelSpacing };
  }

  return {
    imagePlaneModule,
    hasPixelSpacing,
    calibrationEvent: {
      scale,
      calibration,
    },
  };
}

/**
 * Builds metadata for an image, including image plane and pixel modules
 * @param image - The image to build metadata for
 * @param options - Options for building metadata
 * @returns The built metadata
 */
export function buildMetadata(image: IImage): BuildMetadataResult {
  const imageId = image.imageId;

  const {
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    samplesPerPixel,
  } = metaData.get('imagePixelModule', imageId);

  const { windowWidth, windowCenter, voiLUTFunction } = image;

  const { modality } = metaData.get('generalSeriesModule', imageId);
  const imageIdScalingFactor = metaData.get('scalingModule', imageId);
  const calibration = metaData.get(MetadataModules.CALIBRATION, imageId);

  const voiLUTFunctionEnum = getValidVOILUTFunction(voiLUTFunction);

  const imagePlaneModule = getImagePlaneModule(imageId);

  return {
    calibration,
    scalingFactor: imageIdScalingFactor,
    voiLUTFunction: voiLUTFunctionEnum,
    modality,
    imagePlaneModule,
    imagePixelModule: {
      bitsAllocated,
      bitsStored,
      samplesPerPixel,
      highBit,
      photometricInterpretation,
      pixelRepresentation,
      windowWidth: windowWidth as number,
      windowCenter: windowCenter as number,
      modality,
      voiLUTFunction: voiLUTFunctionEnum,
    },
  };
}
