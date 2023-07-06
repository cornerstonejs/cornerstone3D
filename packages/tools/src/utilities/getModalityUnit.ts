import { metaData } from '@cornerstonejs/core';

function getModalityUnit(
  modality: string,
  isPreScaled: boolean,
  isSuvScaled: boolean,
  imageId: string
): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (modality === 'PT') {
    if (isPreScaled === true) {
      if (isSuvScaled === true) {
        return 'SUV';
      }

      const petSeriesModule = metaData.get('petSeriesModule', imageId);
      const units = petSeriesModule?.units;

      if (units) {
        return units;
      } else {
        return 'unitless';
      }
    } else {
      return 'raw';
    }
  } else {
    return '';
  }
}

export { getModalityUnit };
