import * as metaData from '../metaData';
import type { ScalingParameters } from '../types';

/**
 * It returns the scaling parameters for the image with the given imageId. This can be
 * used to get passed (as an option) to the imageLoader in order to apply scaling to the image inside
 * the imageLoader.
 * @param imageId - The imageId of the image
 * @returns ScalingParameters
 */
export default function getScalingParameters(
  imageId: string
): ScalingParameters {
  const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};
  const generalSeriesModule =
    metaData.get('generalSeriesModule', imageId) || {};

  const { modality } = generalSeriesModule;

  const scalingParameters = {
    rescaleSlope: modalityLutModule.rescaleSlope || 1,
    rescaleIntercept: modalityLutModule.rescaleIntercept ?? 0,
    modality,
  };

  const suvFactor = metaData.get('scalingModule', imageId) || {};

  return {
    ...scalingParameters,
    ...(modality === 'PT' && {
      suvbw: suvFactor.suvbw,
      suvbsa: suvFactor.suvbsa,
      suvlbm: suvFactor.suvlbm,
    }),
  };
}
