import { metaData } from '../..';
import { ImagePlaneModule } from 'core/src/types';

export default function getImagePlaneModule(imageId: string) {
  let hasPixelSpacing = true;
  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

  const calibratedPixelSpacing = metaData.get(
    'calibratedPixelSpacing',
    imageId
  );

  const newImagePlaneModule: ImagePlaneModule = {
    ...imagePlaneModule,
  };

  if (calibratedPixelSpacing?.appliedSpacing) {
    // Over-ride the image plane module spacing, as the measurement data
    // has already been created with the calibrated spacing provided from
    // down below inside calibrateIfNecessary
    const { rowPixelSpacing, columnPixelSpacing } =
      calibratedPixelSpacing.appliedSpacing;
    newImagePlaneModule.rowPixelSpacing = rowPixelSpacing;
    newImagePlaneModule.columnPixelSpacing = columnPixelSpacing;
  }

  if (!newImagePlaneModule.columnPixelSpacing) {
    newImagePlaneModule.columnPixelSpacing = 1;
    hasPixelSpacing = false;
  }

  if (!newImagePlaneModule.rowPixelSpacing) {
    newImagePlaneModule.rowPixelSpacing = 1;
    hasPixelSpacing = false;
  }

  if (!newImagePlaneModule.columnCosines) {
    newImagePlaneModule.columnCosines = [0, 1, 0];
  }

  if (!newImagePlaneModule.rowCosines) {
    newImagePlaneModule.rowCosines = [1, 0, 0];
  }

  if (!newImagePlaneModule.imagePositionPatient) {
    newImagePlaneModule.imagePositionPatient = [0, 0, 0];
  }

  if (!newImagePlaneModule.imageOrientationPatient) {
    newImagePlaneModule.imageOrientationPatient = new Float32Array([
      1, 0, 0, 0, 1, 0,
    ]);
  }

  return { hasPixelSpacing, imagePlaneModule: newImagePlaneModule };
}
