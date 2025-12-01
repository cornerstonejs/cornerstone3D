import type { ImagePlaneModuleMetadata } from '../../types';
import { MetadataModules } from '../../enums';
import { toNumber } from '../toNumber';
import calibratedPixelSpacingMetadataProvider from '../calibratedPixelSpacingMetadataProvider';
import getPixelSpacingInformation from '../getPixelSpacingInformation';

import { getMetaData, addProvider, getNormalized } from '../../metaData';

console.warn('getMetaData=', getMetaData);

const typeToProviderMap = new Map<string, (imageId: string) => unknown>();

/**
 * The computed metadata provider centralizes providing of metadata that is
 * created from other metadata, either summarizing it, or adding extra
 * information, or formatting the metadata.
 */
const metadataProvider = {
  /**
   * Returns the metadata for an imageId if it exists.
   * @param type - the type of metadata to enquire about
   * @param imageId - the imageId to enquire about
   * @returns the calibrated pixel spacings for the imageId if it exists, otherwise undefined
   */
  get: (type: string, imageId: string) => {
    const provider = typeToProviderMap.get(type);
    if (provider) {
      return provider.call(this, imageId);
    }
  },

  clearAllProviders: () => {
    typeToProviderMap.clear();
  },

  registerDefaultProviders: () => {
    typeToProviderMap.set(MetadataModules.IMAGE_PLANE, getImagePlaneCalibrated);
    typeToProviderMap.set(MetadataModules.IMAGE_PLANE_BASE, getImagePlaneBase);
  },
};

const IMAGE_PLANE_BASE_MODULES = [
  MetadataModules.FRAME_OF_REFERENCE,
  MetadataModules.PIXEL_MEASURES,
  MetadataModules.FRAME_PIXEL_DATA,
  MetadataModules.XrayGeometry,
  MetadataModules.ULTRASOUND_ENHANCED_REGION,
];
export function getImagePlaneBase(imageId: string) {
  const result = getNormalized(imageId, IMAGE_PLANE_BASE_MODULES);
  console.warn('PLANE_BASE=', JSON.stringify(result, null, 2));
  return result;
}

export function getImagePlaneCalibrated(
  imageId: string
): ImagePlaneModuleMetadata {
  const instance = getMetaData(MetadataModules.IMAGE_PLANE_BASE, imageId);
  const { ImageOrientationPatient, ImagePositionPatient } = instance;
  const { PixelSpacing, type } = getPixelSpacingInformation(instance);

  let rowPixelSpacing;
  let columnPixelSpacing;

  let rowCosines;
  let columnCosines;

  let usingDefaultValues = false;
  let isDefaultValueSetForRowCosine = false;
  let isDefaultValueSetForColumnCosine = false;
  let imageOrientationPatient;
  if (PixelSpacing) {
    [rowPixelSpacing, columnPixelSpacing] = PixelSpacing;
    const calibratedPixelSpacing = calibratedPixelSpacingMetadataProvider.get(
      'calibratedPixelSpacing',
      imageId
    );
    if (!calibratedPixelSpacing) {
      calibratedPixelSpacingMetadataProvider.add(imageId, {
        rowPixelSpacing: parseFloat(PixelSpacing[0]),
        columnPixelSpacing: parseFloat(PixelSpacing[1]),
        type,
      });
    }
  } else {
    rowPixelSpacing = columnPixelSpacing = 1;
    usingDefaultValues = true;
  }

  if (ImageOrientationPatient) {
    rowCosines = toNumber(ImageOrientationPatient.slice(0, 3));
    columnCosines = toNumber(ImageOrientationPatient.slice(3, 6));
    imageOrientationPatient = toNumber(ImageOrientationPatient);
  } else {
    rowCosines = [1, 0, 0];
    columnCosines = [0, 1, 0];
    imageOrientationPatient = [1, 0, 0, 0, 1, 0];
    usingDefaultValues = true;
    isDefaultValueSetForRowCosine = true;
    isDefaultValueSetForColumnCosine = true;
  }

  const imagePositionPatient = toNumber(ImagePositionPatient) || [0, 0, 0];
  if (!ImagePositionPatient) {
    usingDefaultValues = true;
  }

  const result = {
    frameOfReferenceUID: instance.FrameOfReferenceUID,
    rows: toNumber(instance.Rows),
    columns: toNumber(instance.Columns),
    spacingBetweenSlices: toNumber(instance.SpacingBetweenSlices),
    imageOrientationPatient,
    rowCosines,
    isDefaultValueSetForRowCosine,
    columnCosines,
    isDefaultValueSetForColumnCosine,
    imagePositionPatient,
    sliceThickness: toNumber(instance.SliceThickness),
    sliceLocation: toNumber(instance.SliceLocation),
    pixelSpacing: toNumber(PixelSpacing || 1),
    rowPixelSpacing: rowPixelSpacing ? toNumber(rowPixelSpacing) : null,
    columnPixelSpacing: columnPixelSpacing
      ? toNumber(columnPixelSpacing)
      : null,
  };
  Object.defineProperty(result, 'usingDefaultValues', {
    value: usingDefaultValues,
  });
  return result;
}

metadataProvider.registerDefaultProviders();
addProvider(metadataProvider.get, 9880);

export default metadataProvider;
