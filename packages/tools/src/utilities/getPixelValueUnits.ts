import { metaData } from '@cornerstonejs/core';

type pixelUnitsOptions = {
  isPreScaled: boolean;
  isSuvScaled: boolean;
};

/**
 * Determines the appropriate pixel value units based on the image modality and options.
 * @param modality - The modality of the image (e.g., 'CT', 'PT').
 * @param imageId - The unique identifier for the image.
 * @param options - Additional options for determining pixel units.
 * @returns The appropriate pixel value units as a string.
 */
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

/**
 * Handles the determination of pixel value units for PT (Positron Emission Tomography) modality.
 * @param imageId - The unique identifier for the image.
 * @param options - Additional options for determining pixel units.
 * @returns The appropriate pixel value units for PT modality as a string.
 */
function _handlePTModality(
  imageId: string,
  options: pixelUnitsOptions
): string {
  if (!options.isPreScaled) {
    return 'raw';
  }

  if (options.isSuvScaled) {
    return 'SUV';
  }

  const generalSeriesModule = metaData.get('generalSeriesModule', imageId);

  // It might be possible that the reference ImageId is not the one
  // that is being displayed. So we need to get the modality from imageId again
  if (generalSeriesModule?.modality === 'PT') {
    const petSeriesModule = metaData.get('petSeriesModule', imageId);
    return petSeriesModule?.units || 'unitless';
  }

  return 'unknown';
}

export { getPixelValueUnits, pixelUnitsOptions };
