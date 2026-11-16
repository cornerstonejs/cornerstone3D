import { utilities } from '@cornerstonejs/core';
import { ctVoiRange } from './setCtTransferFunctionForVolumeActor';

/**
 * The window of SUV that the PET helpers set: 0 to 5.
 */
const petVoiRange = { lower: 0, upper: 5 };

/**
 * The opacities of `setPetColorMapTransferFunctionForVolumeActor`, as values
 * of the data (SUV): clear at 0, 0.9 from 0.1 SUV, 1 at 5 SUV.
 */
const petColorMapOpacity = [
  { value: 0, opacity: 0 },
  { value: 0.1, opacity: 0.9 },
  { value: 5, opacity: 1 },
];

/**
 * The presentation of a direct next planar viewport that draws what the
 * callback `setCtTransferFunctionForVolumeActor` draws: a grey window of
 * width 400 and centre 40.
 *
 * @returns The presentation for `setDisplaySetPresentation`.
 */
export function ctPresentation() {
  return { voiRange: { ...ctVoiRange } };
}

/**
 * The presentation that draws what the callback
 * `setPetTransferFunctionForVolumeActor` draws: SUV 0 to 5, inverted, so a
 * high uptake is dark.
 *
 * @returns The presentation for `setDisplaySetPresentation`.
 */
export function petPresentation() {
  return { voiRange: { ...petVoiRange }, invert: true };
}

/**
 * The presentation that draws what the callback
 * `setPetColorMapTransferFunctionForVolumeActor` draws: a colormap over SUV
 * 0 to 5 with the opacities of the callback. They go in `opacityMapping`,
 * whose values are values of the data, as in the callback; a list in
 * `opacity` is read as parts of the window on a next viewport. Without a
 * registration the colormap is hsv, as in the callback. A registration, as
 * the `preset` that some examples give the callback, is registered under its
 * name first.
 *
 * @param colormapRegistration - The colormap of the callback's `preset`, if any.
 * @returns The presentation for `setDisplaySetPresentation`.
 */
export function petColorMapPresentation(colormapRegistration) {
  let name = 'hsv';

  if (colormapRegistration) {
    utilities.colormap.registerColormap(colormapRegistration);
    name = colormapRegistration.name || colormapRegistration.Name;
  }

  return {
    voiRange: { ...petVoiRange },
    colormap: {
      name,
      opacityMapping: petColorMapOpacity.map((point) => ({ ...point })),
    },
  };
}
