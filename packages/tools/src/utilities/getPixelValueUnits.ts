import { metaData } from '@cornerstonejs/core';

type pixelUnitsOptions = {
  isPreScaled: boolean;
  isSuvScaled: boolean;
};

function getPixelValueUnits(
  modality: string,
  imageId: string,
  options: pixelUnitsOptions
): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (modality === 'PT') {
    return _handlePTModality(imageId, options);
  } else {
    return '';
  }
}

function _handlePTModality(imageId: string, options: pixelUnitsOptions) {
  if (!options.isPreScaled) {
    return 'raw';
  }

  if (options.isSuvScaled) {
    return 'SUV';
  }

  const generalSeriesModule = metaData.get('generalSeriesModule', imageId);

  // it might be possible that the reference ImageId is not the one
  // that is being displayed. So we need to get the modality from imageId again
  if (generalSeriesModule?.modality === 'PT') {
    const petSeriesModule = metaData.get('petSeriesModule', imageId);
    return petSeriesModule?.units || 'unitless';
  }
}

export { getPixelValueUnits, pixelUnitsOptions };
