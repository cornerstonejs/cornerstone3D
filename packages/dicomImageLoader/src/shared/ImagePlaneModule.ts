import { type Types, Enums, utilities } from '@cornerstonejs/core';
import { Module, Modules } from './Module';

const { IMAGE_PLANE } = Enums.MetadataModules;

const {
  toNumber,
  getPixelSpacingInformation,
  calibratedPixelSpacingMetadataProvider,
} = utilities;

export const PIXEL_INSTANCE = 'PixelInstanceModule';

export class ImagePlaneModule extends Module<Types.ImagePlaneModuleMetadata> {
  public fromInstance(instance) {
    const { ImageOrientationPatient, ImagePositionPatient } = instance;
    console.warn('Extracting image plane module from', instance);

    // Fallback for DX images.
    // TODO: We should use the rest of the results of this function
    // to update the UI somehow
    const { PixelSpacing, type } = getPixelSpacingInformation(instance) || {};

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
      const calibratedPixelSpacing =
        utilities.calibratedPixelSpacingMetadataProvider.get(
          'calibratedPixelSpacing',
          instance.imageId
        );
      if (!calibratedPixelSpacing) {
        calibratedPixelSpacingMetadataProvider.add(instance.imageId, {
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

    return {
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
      usingDefaultValues,
    };
  }

  fromDataset(dataSet) {
    const instance = Modules[PIXEL_INSTANCE].fromDataset(dataSet);
    return this.fromInstance(instance);
  }
  fromNatural(natural) {
    const instance = Modules[PIXEL_INSTANCE].fromNatural(natural);
    return this.fromInstance(instance);
  }
  fromMetadata(metadata) {
    const instance = Modules[PIXEL_INSTANCE].fromMetadata(metadata);
    return this.fromInstance(instance);
  }
}

Modules[IMAGE_PLANE] = new ImagePlaneModule(IMAGE_PLANE);
