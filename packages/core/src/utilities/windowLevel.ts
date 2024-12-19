import VOILUTFunctionType from '../enums/VOILUTFunctionType';
import { logit } from './logit';

/**
 * Given a low and high window level, return the window width and window center
 * Formulas from note 4 in
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.2.1
 * extended to allow for low/high swapping
 * @param low - The low window level.
 * @param high - The high window level.
 * @returns a JavaScript object with two properties: windowWidth and windowCenter.
 */
function toWindowLevel(
  low: number,
  high: number
): {
  windowWidth: number;
  windowCenter: number;
} {
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
 *   if x <= c - 0.5 - (w-1)/2 => lower bound
 *   if x > c - 0.5 + (w-1)/2 => upper bound
 *
 * LINEAR_EXACT (C.11.2.1.3.2):
 * - Uses:
 *   lower = c - w/2
 *   upper = c + w/2
 *
 * SIGMOID (C.11.2.1.3.1):
 * - The sigmoid does not define linear "bounds" in the same way. It's asymptotic.
 * - We define approximate bounds by choosing output thresholds (e.g., 1% and 99%)
 *   and solving for input x:
 *   y = 1/(1 + exp(-4*(x - c)/w))
 *   For y=0.01 and y=0.99, solve for x.
 *
 * @param windowWidth - The width of the window
 * @param windowCenter - The center of the window
 * @param voiLUTFunction - 'LINEAR' | 'LINEAR_EXACT' | 'SIGMOID'
 * @returns An object containing the lower and upper bounds of the window
 */
function toLowHighRange(
  windowWidth: number,
  windowCenter: number,
  voiLUTFunction: VOILUTFunctionType = VOILUTFunctionType.LINEAR
): {
  lower: number;
  upper: number;
} {
  if (voiLUTFunction === VOILUTFunctionType.LINEAR) {
    // From C.11.2.1.2.1 (linear function)
    return {
      lower: windowCenter - 0.5 - (windowWidth - 1) / 2,
      upper: windowCenter - 0.5 + (windowWidth - 1) / 2,
    };
  } else if (voiLUTFunction === VOILUTFunctionType.LINEAR_EXACT) {
    // From C.11.2.1.3.2 (linear exact function)
    return {
      lower: windowCenter - windowWidth / 2,
      upper: windowCenter + windowWidth / 2,
    };
  } else if (voiLUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID) {
    // From C.11.2.1.3.1 (sigmoid function)
    // Sigmoid: y = 1 / (1 + exp(-4*(x - c)/w))
    const xLower = logit(0.01, windowCenter, windowWidth);
    const xUpper = logit(0.99, windowCenter, windowWidth);
    return {
      lower: xLower,
      upper: xUpper,
    };
  } else {
    throw new Error('Invalid VOI LUT function');
  }
}

export { toWindowLevel, toLowHighRange };
