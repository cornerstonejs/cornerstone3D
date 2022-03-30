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

  const maxVoi = image.maxPixelValue * image.slope + image.intercept;
  const minVoi = image.minPixelValue * image.slope + image.intercept;
  const ww = maxVoi - minVoi;
  const wc = (maxVoi + minVoi) / 2;

  if (viewport.voi === undefined) {
    viewport.voi = {
      windowWidth: ww,
      windowCenter: wc,
    };
  } else {
    viewport.voi.windowWidth = ww;
    viewport.voi.windowCenter = wc;
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
    (viewport.voi.windowWidth !== undefined &&
      viewport.voi.windowCenter !== undefined)
  );
}
