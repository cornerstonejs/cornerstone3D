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

  const scalingModules = metaData.get('scalingModule', imageId) || {};

  // Modality-specific scaling (PT SUV body weight, RTDOSE dose grid scaling)
  // must be applied even when the modality LUT is an identity transform. PET
  // stored in counts (e.g. Philips CNTS) commonly has rescaleSlope 1 /
  // intercept 0 while still requiring suvbw to convert to SUV, so this is
  // checked before the identity-transform short-circuit below.
  const hasPTScaling =
    modality === 'PT' &&
    typeof scalingModules.suvbw === 'number' &&
    !isNaN(scalingModules.suvbw);
  const hasDoseScaling =
    modality === 'RTDOSE' && typeof scalingModules.DoseGridScaling === 'number';

  // Identity transform (slope 1, intercept 0) with no modality-specific scaling
  // is implicitly non-prescaled; do not set preScale.
  if (
    rescaleSlope === 1 &&
    (rescaleIntercept === 0 || rescaleIntercept == null) &&
    !hasPTScaling &&
    !hasDoseScaling
  ) {
    return undefined;
  }

  const scalingParameters = {
    rescaleSlope: rescaleSlope ?? 1,
    rescaleIntercept: rescaleIntercept ?? 0,
    modality,
  };

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
