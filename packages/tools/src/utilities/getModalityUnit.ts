import { metaData } from '@cornerstonejs/core';

type ModalityUnitOptions = {
  isPreScaled: boolean;
  isSuvScaled: boolean;
};

function getModalityUnit(
  modality: string,
  imageId: string,
  options: ModalityUnitOptions
): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (modality === 'PT') {
    return _handlePTModality(imageId, options);
  } else {
    return '';
  }
}

function _handlePTModality(imageId: string, options: ModalityUnitOptions) {
  if (!options.isPreScaled) {
    return 'raw';
  }

  if (options.isSuvScaled) {
    return 'SUV';
  }

  const petSeriesModule = metaData.get('petSeriesModule', imageId);
  return petSeriesModule?.units || 'unitless';
}

export { getModalityUnit, ModalityUnitOptions };
