/* eslint no-bitwise: 0 */

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
  return function (modalityLutValue) {
    const value =
      ((modalityLutValue - (windowCenter - 0.5)) / (windowWidth - 1) + 0.5) *
      255.0;
    return Math.min(Math.max(value, 0), 255);
  };
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
  const bitsPerEntry = Math.max(...voiLUT.lut).toString(2).length;
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
 * @param {Number} windowWidth Window Width
 * @param {Number} windowCenter Window Center
 * @param {LUT} [voiLUT] Volume of Interest Lookup Table Object
 *
 * @return {VOILUTFunction} VOI LUT mapping function
 * @memberof VOILUT
 */
export default function (windowWidth: number, windowCenter: number, voiLUT) {
  if (voiLUT) {
    return generateNonLinearVOILUT(voiLUT);
  }

  return generateLinearVOILUT(windowWidth, windowCenter);
}
