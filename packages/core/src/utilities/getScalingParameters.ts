import { get as metaDataGet } from '../metaData';
import { ScalingParameters } from '../types';

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
  const modalityLutModule = metaDataGet('modalityLutModule', imageId) || {};
  const generalSeriesModule = metaDataGet('generalSeriesModule', imageId) || {};

  const { modality } = generalSeriesModule;

  const scalingParameters = {
    rescaleSlope: modalityLutModule.rescaleSlope || 1,
    rescaleIntercept: modalityLutModule.rescaleIntercept ?? 0,
    modality,
  };

  const suvFactor = metaDataGet('scalingModule', imageId) || {};

  return {
    ...scalingParameters,
    ...(modality === 'PT' && {
      suvbw: suvFactor.suvbw,
      suvbsa: suvFactor.suvbsa,
      suvlbm: suvFactor.suvlbm,
    }),
  };
}
