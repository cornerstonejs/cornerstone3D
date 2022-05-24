import { ScalingParameters } from '../types';
import * as metaData from '../metaData';

/**
 * It returns the scaling parameters for the image with the given imageId. This can be
 * used to get passed (as an option) to the imageLoader in order to apply scaling to the image inside
 * the imageLoader.
 * @param imageId - The imageId of the image
 * @returns ScalingParameters
 */
export default function getScalingParameters(
  imageId: string
): ScalingParameters | undefined {
  const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};

  const generalSeriesModule =
    metaData.get('generalSeriesModule', imageId) || {};

  const { modality } = generalSeriesModule;

  const scalingParameters: ScalingParameters = {
    rescaleSlope: modalityLutModule.rescaleSlope,
    rescaleIntercept: modalityLutModule.rescaleIntercept,
    modality,
  };

  if (modality !== 'PT') {
    return scalingParameters;
  }

  const suvFactor = metaData.get('scalingModule', imageId) || {};

  if (modality === 'PT' && suvFactor.suvbw) {
    return {
      ...scalingParameters,
      suvbw: suvFactor.suvbw,
    };
  }
}
