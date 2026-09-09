import { normalizeVOILUTFunction } from '../../../../utilities/voiLUTFunction';
import type { IImage, CPUFallbackViewport } from '../../../../types';

/**
 * Computes the VOI to display all the pixels if no VOI LUT data (Window Width/Window Center or voiLUT) exists on the viewport object.
 *
 * @param viewport - Object containing the viewport properties
 * @param image - An Image loaded by a Cornerstone Image Loader
 */
export default function computeAutoVoi(
  viewport: CPUFallbackViewport,
  image: IImage
): void {
  if (hasVoi(viewport)) {
    return;
  }

  // A prescaled image already has the modality LUT baked into its pixel values
  // (and therefore into min/maxPixelValue), so applying slope/intercept again
  // here would compute a window for the wrong value range.
  const slope = image.isPreScaled ? 1 : image.slope;
  const intercept = image.isPreScaled ? 0 : image.intercept;
  const maxVoi = image.maxPixelValue * slope + intercept;
  const minVoi = image.minPixelValue * slope + intercept;
  const ww = maxVoi - minVoi;
  const wc = (maxVoi + minVoi) / 2;

  if (viewport.voi === undefined) {
    viewport.voi = {
      windowWidth: ww,
      windowCenter: wc,
      voiLUTFunction: normalizeVOILUTFunction(image.voiLUTFunction),
    };
  } else {
    viewport.voi.windowWidth = ww;
    viewport.voi.windowCenter = wc;
    viewport.voi.voiLUTFunction ??= normalizeVOILUTFunction(
      image.voiLUTFunction
    );
  }
}

/**
 * Check if viewport has voi LUT data
 * @param viewport - The viewport to check for voi LUT data
 * @returns true viewport has LUT data (Window Width/Window Center or voiLUT). Otherwise, false.
 */
function hasVoi(viewport: CPUFallbackViewport): boolean {
  const hasLut =
    viewport.voiLUT && viewport.voiLUT.lut && viewport.voiLUT.lut.length > 0;

  return (
    hasLut ||
    (viewport.voi?.windowWidth !== undefined &&
      viewport.voi?.windowCenter !== undefined)
  );
}
