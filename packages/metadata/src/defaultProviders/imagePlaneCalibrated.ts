import type { ImagePlaneModuleMetadata } from '../types';
import { MetadataModules } from '../enums';
import { toNumber } from '../toNumber';
import getPixelSpacingInformation from '../getPixelSpacingInformation';

import { addTypedProvider, setTypedValue, getMetaData } from '../../metaData';

export const getImagePlaneCalibrated = (
  next,
  imageId: string,
  instance,
  options
): ImagePlaneModuleMetadata => {
  if (!instance) {
    console.warn('**** No instance data to get image plane calibrated from');
    return next(imageId, instance, options);
  }
  console.warn('Getting image plane module from instance', instance);
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
    const calibratedPixelSpacing = getMetaData(
      'calibratedPixelSpacing',
      imageId
    );
    if (!calibratedPixelSpacing) {
      setTypedValue.add('calibratedPixelSpacing', imageId, {
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
    imageOrientationPatient,
    rowCosines,
    columnCosines,
    imagePositionPatient,
    sliceLocation: toNumber(instance.SliceLocation),
    pixelSpacing: toNumber(PixelSpacing),
    rowPixelSpacing: rowPixelSpacing ? toNumber(rowPixelSpacing) : null,
    sliceThickness: toNumber(instance.SliceThickness),
    spacingBetweenSlices: toNumber(instance.SpacingBetweenSlices),
    columnPixelSpacing: columnPixelSpacing
      ? toNumber(columnPixelSpacing)
      : null,
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

addTypedProvider(MetadataModules.IMAGE_PLANE, getImagePlaneCalibrated);

export default getImagePlaneCalibrated;
