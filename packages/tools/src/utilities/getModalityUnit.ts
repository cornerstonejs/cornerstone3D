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

  const generalSeriesModule = metaData.get('generalSeriesModule', imageId);

  // it might be possible that the referenceImageId is not the one
  // that is being displayed. So we need to get the modality from imageId again
  if (generalSeriesModule?.modality === 'PT') {
    const petSeriesModule = metaData.get('petSeriesModule', imageId);
    return petSeriesModule?.units || 'unitless';
  }
}

export { getModalityUnit, ModalityUnitOptions };
