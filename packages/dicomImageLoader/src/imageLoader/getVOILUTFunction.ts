import type { Enums } from '@cornerstonejs/core';

/**
 * Reads the VOI LUT Function (0028,1056) from a voiLutModule.
 *
 * Metadata providers return it as a plain string (e.g. "LINEAR"), while other
 * sources give an array of values. Indexing a string would keep only its first
 * character, so both shapes are handled here.
 *
 * @param voiLutModule - The voiLutModule from the metadata provider
 * @returns The VOI LUT Function, or undefined when it is absent
 */
function getVOILUTFunction(voiLutModule): Enums.VOILUTFunctionType | undefined {
  const value = voiLutModule?.voiLUTFunction || voiLutModule?.voiLutFunction;
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first
    ? (first as Enums.VOILUTFunctionType)
    : undefined;
}

export default getVOILUTFunction;
