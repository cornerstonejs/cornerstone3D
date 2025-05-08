import type { Types } from '@cornerstonejs/core';

/**
 * It returns the scaling parameters for the image with the given imageId. This can be
 * used to get passed (as an option) to the imageLoader in order to apply scaling to the image inside
 * the imageLoader.
 * @param imageId - The imageId of the image
 * @returns ScalingParameters
 */
export default function getScalingParameters(metaData, imageId: string) {
  const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};

  const generalSeriesModule = (metaData.get('generalSeriesModule', imageId) ||
    {}) as Types.GeneralSeriesModuleMetadata;

  const { modality } = generalSeriesModule;

  const scalingParameters = {
    rescaleSlope: modalityLutModule.rescaleSlope,
    rescaleIntercept: modalityLutModule.rescaleIntercept,
    modality,
  };

  const scalingModules = metaData.get('scalingModule', imageId) || {};

  return {
    ...scalingParameters,
    ...(modality === 'PT' && { suvbw: scalingModules.suvbw }),
    ...(modality === 'RTDOSE' && {
      doseGridScaling: scalingModules.DoseGridScaling,
      doseSummation: scalingModules.DoseSummation,
      doseType: scalingModules.DoseType,
      doseUnit: scalingModules.DoseUnit,
    }),
  };
}
