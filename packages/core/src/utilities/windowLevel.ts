import VOILUTFunctionType from '../enums/VOILUTFunctionType';
import { getValidVOILUTFunction } from './voiLUTFunction';

/**
 * Given a low and high window level, return the window width and window center
 * Formulas from note 4 in
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.2.1
 * extended to allow for low/high swapping
 *
 * This is the exact inverse of {@link toLowHighRange} for the same VOI LUT
 * function, so a range -> window -> range round trip (what the window level
 * tools do on every drag) is lossless.
 *
 * @param low - The low window level.
 * @param high - The high window level.
 * @param voiLUTFunction - 'LINEAR' (default) | 'LINEAR_EXACT' | 'SIGMOID'
 * @returns a JavaScript object with two properties: windowWidth and windowCenter.
 */
function toWindowLevel(
  low: number,
  high: number,
  voiLUTFunction?: VOILUTFunctionType | string
): {
  windowWidth: number;
  windowCenter: number;
} {
  if (
    getValidVOILUTFunction(voiLUTFunction) === VOILUTFunctionType.LINEAR_EXACT
  ) {
    // Inverse of C.11.2.1.3.2, which has no halfpixel offsets
    return {
      windowWidth: Math.abs(high - low),
      windowCenter: (low + high) / 2,
    };
  }

  // Allow for swapping high/low
  const windowWidth = Math.abs(high - low) + 1;
  const windowCenter = (low + high + 1) / 2;

  return { windowWidth, windowCenter };
}

/**
 * Given a window width and center, return the lower and upper bounds of the window.
 * The calculation depends on the VOI LUT Function:
 *
 * LINEAR (default):
 * - Uses the DICOM standard formula from C.11.2.1.2.1:
 *   if x {'<='} c - 0.5 - (w-1)/2 {'=>'} lower bound
 *   if x {'>'} c - 0.5 + (w-1)/2 {'=>'} upper bound
 *
 * LINEAR_EXACT (C.11.2.1.3.2):
 * - Uses:
 *   lower = c - w/2
 *   upper = c + w/2
 *
 * SIGMOID (C.11.2.1.3.1):
 * - The sigmoid is asymptotic, so it has no linear bounds to convert to. It is
 *   deliberately given the same bounds as LINEAR: the range is only a carrier
 *   for the window here, and the sigmoid transfer function recovers the window
 *   width/center from it via `toWindowLevel` before evaluating
 *   `1 / (1 + exp(-4 * (x - c) / w))`. Because the LINEAR mapping is an exact
 *   inverse of `toWindowLevel`, the window the file specified is the window
 *   that gets rendered. Picking asymptote-based bounds instead (e.g. the 1% and
 *   99% output levels) would break that round trip and silently widen the
 *   window on every conversion.
 *
 * An unrecognized VOI LUT Function falls back to LINEAR rather than throwing,
 * so malformed metadata cannot break rendering.
 *
 * @param windowWidth - The width of the window
 * @param windowCenter - The center of the window
 * @param voiLUTFunction - 'LINEAR' | 'LINEAR_EXACT' | 'SIGMOID'
 * @returns An object containing the lower and upper bounds of the window
 */
function toLowHighRange(
  windowWidth: number,
  windowCenter: number,
  voiLUTFunction?: VOILUTFunctionType | string
): {
  lower: number;
  upper: number;
} {
  if (
    getValidVOILUTFunction(voiLUTFunction) === VOILUTFunctionType.LINEAR_EXACT
  ) {
    // From C.11.2.1.3.2 (linear exact function)
    return {
      lower: windowCenter - windowWidth / 2,
      upper: windowCenter + windowWidth / 2,
    };
  }

  // From C.11.2.1.2.1 (linear function), also used to carry the window for the
  // sampled sigmoid. See the note above.
  return {
    lower: windowCenter - 0.5 - (windowWidth - 1) / 2,
    upper: windowCenter - 0.5 + (windowWidth - 1) / 2,
  };
}

export { toWindowLevel, toLowHighRange };
