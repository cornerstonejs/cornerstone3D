import { metaData } from '..';
import isEqual from './isEqual';

function isValidVolume(imageIds: string[]): boolean {
  const imageId0 = imageIds[0];

  const { modality, seriesInstanceUID } = metaData.get(
    'generalSeriesModule',
    imageId0
  );

  const {
    imageOrientationPatient,
    pixelSpacing,
    frameOfReferenceUID,
    columns,
    rows,
  } = metaData.get('imagePlaneModule', imageId0);

  const baseMetadata = {
    modality,
    imageOrientationPatient,
    pixelSpacing,
    frameOfReferenceUID,
    columns,
    rows,
    seriesInstanceUID,
  };

  const validVolume = imageIds.every((imageId) => {
    const { modality, seriesInstanceUID } = metaData.get(
      'generalSeriesModule',
      imageId
    );
    const { imageOrientationPatient, pixelSpacing, columns, rows } =
      metaData.get('imagePlaneModule', imageId);

    return (
      seriesInstanceUID === baseMetadata.seriesInstanceUID &&
      modality === baseMetadata.modality &&
      columns === baseMetadata.columns &&
      rows === baseMetadata.rows &&
      isEqual(imageOrientationPatient, baseMetadata.imageOrientationPatient) &&
      isEqual(pixelSpacing, baseMetadata.pixelSpacing)
    );
  });

  return validVolume;
}

export { isValidVolume };
