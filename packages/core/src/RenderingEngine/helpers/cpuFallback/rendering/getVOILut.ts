/* eslint no-bitwise: 0 */
import VOILUTFunctionType from '../../../../enums/VOILUTFunctionType';
import { getValidVOILUTFunction } from '../../../../utilities/voiLUTFunction';
import type { CPUFallbackLUT } from '../../../../types';

/**
 * Volume of Interest Lookup Table Function
 *
 * @typedef {Function} VOILUTFunction
 *
 * @param {Number} modalityLutValue
 * @returns {Number} transformed value
 * @memberof Objects
 */

/**
 * @module: VOILUT
 */

// The CPU rendering path maps into 8 bit display values
const Y_MIN = 0;
const Y_MAX = 255;

function clampToDisplayRange(value: number): number {
  return Math.min(Math.max(value, Y_MIN), Y_MAX);
}

/**
 * Generates the linear VOI LUT function.
 * From the DICOM standard:
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.2.1
 * ((x - (c - 0.5)) / (w-1) + 0.5) * (ymax- ymin) + ymin
 * clipped to the ymin...ymax range
 *
 * @param {Number} windowWidth Window Width
 * @param {Number} windowCenter Window Center
 * @returns {VOILUTFunction} VOI LUT mapping function
 * @memberof VOILUT
 */
function generateLinearVOILUT(windowWidth: number, windowCenter: number) {
  // C.11.2.1.2.1 defines w === 1 (the smallest width it allows) as a threshold
  // rather than a ramp: y = ymin for x <= c - 0.5 and ymax above it. The
  // continuous form divides by w - 1, so it cannot express that - it would
  // divide by zero, and the value exactly at the threshold would land halfway
  // up the display range instead of at ymin.
  if (windowWidth <= 1) {
    const threshold = windowCenter - 0.5;

    return function (modalityLutValue: number): number {
      return modalityLutValue <= threshold ? Y_MIN : Y_MAX;
    };
  }

  const width = windowWidth - 1;

  return function (modalityLutValue: number): number {
    const value =
      ((modalityLutValue - (windowCenter - 0.5)) / width + 0.5) * Y_MAX;

    return clampToDisplayRange(value);
  };
}

/**
 * Generates the LINEAR_EXACT VOI LUT function.
 * From the DICOM standard (C.11.2.1.3.2):
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.3.2
 * ((x - c) / w + 0.5) * (ymax - ymin) + ymin
 * clipped to the ymin...ymax range
 *
 * Unlike LINEAR this has no half-pixel offsets and divides by w rather than
 * w - 1, which matters for the narrow windows LINEAR_EXACT is typically used
 * with (e.g. parametric maps and floating point pixel data).
 *
 * @param {Number} windowWidth Window Width
 * @param {Number} windowCenter Window Center
 * @returns {VOILUTFunction} VOI LUT mapping function
 * @memberof VOILUT
 */
function generateLinearExactVOILUT(windowWidth: number, windowCenter: number) {
  const width = windowWidth === 0 ? Number.EPSILON : windowWidth;

  return function (modalityLutValue: number): number {
    const value = ((modalityLutValue - windowCenter) / width + 0.5) * Y_MAX;

    return clampToDisplayRange(value);
  };
}

/**
 * Generates the SIGMOID VOI LUT function.
 * From the DICOM standard (C.11.2.1.3.1):
 * https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.3.1
 * y = (ymax - ymin) / (1 + exp(-4 * (x - c) / w)) + ymin
 *
 * The sigmoid is asymptotic, so no clipping is needed: it can never leave the
 * ymin...ymax range.
 *
 * @param {Number} windowWidth Window Width
 * @param {Number} windowCenter Window Center
 * @returns {VOILUTFunction} VOI LUT mapping function
 * @memberof VOILUT
 */
function generateSigmoidVOILUT(windowWidth: number, windowCenter: number) {
  const width = windowWidth === 0 ? Number.EPSILON : windowWidth;

  return function (modalityLutValue: number): number {
    return (
      Y_MAX / (1 + Math.exp((-4 * (modalityLutValue - windowCenter)) / width))
    );
  };
}

function maxLUTValue(lut: ArrayLike<number>): number {
  let max = -Infinity;

  for (let i = 0; i < lut.length; i++) {
    if (lut[i] > max) {
      max = lut[i];
    }
  }

  return max;
}

/**
 * Generate a non-linear volume of interest lookup table
 *
 * @param {LUT} voiLUT Volume of Interest Lookup Table Object
 *
 * @returns {VOILUTFunction} VOI LUT mapping function
 * @memberof VOILUT
 */
function generateNonLinearVOILUT(voiLUT) {
  // We don't trust the voiLUT.numBitsPerEntry, mainly thanks to Agfa!
  // Reduced rather than spread into Math.max - VOI LUTs can hold tens of
  // thousands of entries, which overflows the argument limit.
  const bitsPerEntry = maxLUTValue(voiLUT.lut).toString(2).length;
  const shift = bitsPerEntry - 8;
  const minValue = voiLUT.lut[0] >> shift;
  const maxValue = voiLUT.lut[voiLUT.lut.length - 1] >> shift;
  const maxValueMapped = voiLUT.firstValueMapped + voiLUT.lut.length - 1;

  return function (modalityLutValue) {
    if (modalityLutValue < voiLUT.firstValueMapped) {
      return minValue;
    } else if (modalityLutValue >= maxValueMapped) {
      return maxValue;
    }

    return voiLUT.lut[modalityLutValue - voiLUT.firstValueMapped] >> shift;
  };
}

/**
 * Retrieve a VOI LUT mapping function given the current windowing settings
 * and the VOI LUT for the image
 *
 * A VOI LUT Sequence, when present, takes precedence over the window
 * width/center and the VOI LUT Function, since the sequence *is* the
 * transformation.
 *
 * @param {Number} windowWidth Window Width
 * @param {Number} windowCenter Window Center
 * @param {LUT} [voiLUT] Volume of Interest Lookup Table Object
 * @param {String} [voiLUTFunction] VOI LUT Function (0028,1056)
 *
 * @return {VOILUTFunction} VOI LUT mapping function
 * @memberof VOILUT
 */
export default function (
  windowWidth: number,
  windowCenter: number,
  voiLUT?: CPUFallbackLUT,
  voiLUTFunction?: VOILUTFunctionType | string
) {
  if (voiLUT?.lut?.length) {
    return generateNonLinearVOILUT(voiLUT);
  }

  switch (getValidVOILUTFunction(voiLUTFunction)) {
    case VOILUTFunctionType.LINEAR_EXACT:
      return generateLinearExactVOILUT(windowWidth, windowCenter);
    case VOILUTFunctionType.SAMPLED_SIGMOID:
      return generateSigmoidVOILUT(windowWidth, windowCenter);
    default:
      return generateLinearVOILUT(windowWidth, windowCenter);
  }
}
