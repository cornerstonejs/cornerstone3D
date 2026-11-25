import type { ImagePlaneModuleMetadata } from '../../types';
import { MetadataModules } from '../../enums';
import { toFiniteNumber } from '../toNumber';
import { getNaturalizedNumber } from '../getNaturalizedField';
import calibratedPixelSpacingMetadataProvider from '../calibratedPixelSpacingMetadataProvider';
import getPixelSpacingInformation from '../getPixelSpacingInformation';

import { addTypedProvider } from '../../metaData';

export const getImagePlaneCalibrated = (
  next,
  imageId: string,
  instance,
  options
): ImagePlaneModuleMetadata => {
  if (!instance) {
    return next(imageId, instance, options);
  }
  const { ImageOrientationPatient, ImagePositionPatient } = instance;
  const { PixelSpacing, type } = getPixelSpacingInformation(instance);

  let rowPixelSpacing;
  let columnPixelSpacing;

  let rowCosines: number[];
  let columnCosines: number[];

  let usingDefaultValues = false;
  let isDefaultValueSetForRowCosine = false;
  let isDefaultValueSetForColumnCosine = false;
  let imageOrientationPatient: number[];
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
    imageOrientationPatient = toFiniteNumber(
      ImageOrientationPatient as ArrayLike<string | String | number | Number>
    ) || [1, 0, 0, 0, 1, 0];
    rowCosines = imageOrientationPatient.slice(0, 3);
    columnCosines = imageOrientationPatient.slice(3, 6);
  } else {
    rowCosines = [1, 0, 0];
    columnCosines = [0, 1, 0];
    imageOrientationPatient = [1, 0, 0, 0, 1, 0];
    usingDefaultValues = true;
    isDefaultValueSetForRowCosine = true;
    isDefaultValueSetForColumnCosine = true;
  }

  const imagePositionPatient = toFiniteNumber(
    ImagePositionPatient as ArrayLike<string | String | number | Number>
  ) || [0, 0, 0];
  if (!ImagePositionPatient) {
    usingDefaultValues = true;
  }

  const rowPixelSpacingNumber = toFiniteNumber(rowPixelSpacing) ?? null;
  const columnPixelSpacingNumber = toFiniteNumber(columnPixelSpacing) ?? null;
  const pixelSpacing =
    rowPixelSpacingNumber !== null && columnPixelSpacingNumber !== null
      ? [rowPixelSpacingNumber, columnPixelSpacingNumber]
      : Array.isArray(PixelSpacing)
        ? PixelSpacing.map((value) => Number(value)).filter(Number.isFinite)
        : [];

  const result = {
    frameOfReferenceUID: instance.FrameOfReferenceUID,
    rows: getNaturalizedNumber(instance, 'Rows', 0),
    columns: getNaturalizedNumber(instance, 'Columns', 0),
    imageOrientationPatient,
    rowCosines,
    columnCosines,
    imagePositionPatient,
    sliceLocation: getNaturalizedNumber(instance, 'SliceLocation', 0),
    pixelSpacing,
    rowPixelSpacing: rowPixelSpacingNumber,
    sliceThickness: getNaturalizedNumber(instance, 'SliceThickness'),
    spacingBetweenSlices: getNaturalizedNumber(
      instance,
      'SpacingBetweenSlices'
    ),
    columnPixelSpacing: columnPixelSpacingNumber,
  };
  Object.defineProperty(result, 'usingDefaultValues', {
    value: usingDefaultValues,
  });
  Object.defineProperty(result, 'isDefaultValueSetForRowCosine', {
    value: isDefaultValueSetForRowCosine,
  });
  Object.defineProperty(result, 'isDefaultValueSetForColumnCosine', {
    value: isDefaultValueSetForColumnCosine,
  });

  return result;
};

export function registerImagePlaneCalibrated() {
  addTypedProvider(MetadataModules.IMAGE_PLANE, getImagePlaneCalibrated);
}

export default getImagePlaneCalibrated;
