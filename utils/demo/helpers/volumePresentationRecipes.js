import { utilities } from '@cornerstonejs/core';
import { ctVoiRange } from './setCtTransferFunctionForVolumeActor';

/**
 * The window of SUV that the PET helpers set: 0 to 5.
 */
const petVoiRange = { lower: 0, upper: 5 };

/**
 * The opacities that draw the PET layer of a fusion as a legacy volume
 * viewport drew it with `setPetColorMapTransferFunctionForVolumeActor`, as
 * pairs of a value of the data (SUV) and an opacity.
 *
 * The callback sets three points: clear at 0, 0.9 from 0.1 SUV, 1 at 5 SUV.
 * A legacy volume viewport drew an opacity `a` of a plain slice as
 * `1 - (1 - a) ** 0.125`, so 0.9 looked like 0.25. A next viewport draws an
 * opacity as given. These points lie on that curve, close enough that the
 * straight lines between them stay within a quarter of one level of 255 of
 * it. They draw the PET layer of a fusion as the legacy volume viewport drew
 * it with the callback (`planarFusionRecipe_test.js` of the core).
 */
const petColorMapOpacity = [
  [0, 0],
  [0.025, 0.0314],
  [0.0375, 0.0502],
  [0.05, 0.072],
  [0.0625, 0.0982],
  [0.06875, 0.1136],
  [0.075, 0.1311],
  [0.08125, 0.1515],
  [0.0875, 0.176],
  [0.090625, 0.1905],
  [0.09375, 0.2071],
  [0.096875, 0.2265],
  [0.1, 0.2501],
  [1.325, 0.2766],
  [1.9375, 0.2929],
  [2.55, 0.3123],
  [3.1625, 0.3366],
  [3.46875, 0.3516],
  [3.775, 0.3694],
  [4.08125, 0.3917],
  [4.234375, 0.4054],
  [4.3875, 0.4218],
  [4.540625, 0.4422],
  [4.6171875, 0.4547],
  [4.69375, 0.4697],
  [4.7703125, 0.4885],
  [4.8085938, 0.5],
  [4.846875, 0.5138],
  [4.8851562, 0.5309],
  [4.9042969, 0.5415],
  [4.9234375, 0.5541],
  [4.9425781, 0.5699],
  [4.9617188, 0.5911],
  [4.9712891, 0.6056],
  [4.9808594, 0.6251],
  [4.9856445, 0.6383],
  [4.9904297, 0.6562],
  [4.9928223, 0.6683],
  [4.9952148, 0.6847],
  [4.9964111, 0.6958],
  [4.9976074, 0.7109],
  [4.9982056, 0.7211],
  [4.9988037, 0.7349],
  [4.9991028, 0.7442],
  [4.9994019, 0.7569],
  [4.9995514, 0.7655],
  [4.9997009, 0.7771],
  [4.9997757, 0.7849],
  [4.9998505, 0.7956],
  [4.9999252, 0.8125],
  [5, 1],
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
 * `setPetColorMapTransferFunctionForVolumeActor` drew on a legacy volume
 * viewport: a colormap over SUV 0 to 5 with the opacities of
 * `petColorMapOpacity`, which are weaker than the numbers of the callback.
 * They go in `opacityMapping`, whose values are values of the data, as in
 * the callback; a list in `opacity` is read as parts of the window on a next
 * viewport. The overall `opacity` is 1, so that `COLORMAP_MODIFIED` carries a
 * number as it did on a legacy viewport. Without a registration the colormap
 * is hsv, as in the callback. A registration, as the `preset` that some
 * examples give the callback, is registered under its name first.
 *
 * The exponent with which the legacy viewport drew an opacity was not the same
 * for every fusion. It was `Math.fround(d + 0.05) - Math.fround(d - 0.05)`,
 * with `d` 1e6 plus half the diagonal of the bounds of the volumes, so it is
 * 0.125 or 0.0625. It is 0.125 for the PET and CT studies of the examples and
 * 0.0625 for the water phantom of `rectangleROIStartEndThresholdWithSegmentation`.
 * The points of `petColorMapOpacity` are for 0.125; for another exponent `f`
 * each opacity `d` becomes `1 - (1 - d) ** (f / 0.125)`, which is the same
 * curve `1 - (1 - a) ** f` of the opacity `a` of the callback.
 *
 * @param [colormapRegistration] - The colormap of the callback's `preset`, if any.
 * @param [legacySliceOpacityExponent] - The exponent of the legacy look, 0.125 by default.
 * @returns The presentation for `setDisplaySetPresentation`.
 */
export function petColorMapPresentation(
  colormapRegistration,
  legacySliceOpacityExponent = 0.125
) {
  let name = 'hsv';
  const power = legacySliceOpacityExponent / 0.125;

  if (colormapRegistration) {
    utilities.colormap.registerColormap(colormapRegistration);
    name = colormapRegistration.name || colormapRegistration.Name;
  }

  return {
    voiRange: { ...petVoiRange },
    colormap: {
      name,
      opacity: 1,
      opacityMapping: petColorMapOpacity.map(([value, opacity]) => ({
        value,
        opacity: power === 1 ? opacity : 1 - (1 - opacity) ** power,
      })),
    },
  };
}
