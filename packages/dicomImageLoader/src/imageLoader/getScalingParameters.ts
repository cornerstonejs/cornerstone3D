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

  const rescaleSlope = modalityLutModule.rescaleSlope;
  const rescaleIntercept = modalityLutModule.rescaleIntercept;

  // Identity transform (slope 1, intercept 0) is implicitly non-prescaled; do not set preScale.
  if (
    rescaleSlope === 1 &&
    (rescaleIntercept === 0 || rescaleIntercept == null)
  ) {
    return undefined;
  }

  const scalingParameters = {
    rescaleSlope,
    rescaleIntercept,
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
