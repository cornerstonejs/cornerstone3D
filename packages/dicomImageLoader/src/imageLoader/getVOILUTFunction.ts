/**
 * The VOI LUT function of a VOI LUT module, as one value.
 *
 * The loaders give `voiLUTFunction` as a string (`'SIGMOID'`): wadouri reads
 * it with `dataSet.string`, and wadors with `getValue`. Other metadata gives
 * an array (`['SIGMOID']`). `[0]` of a string is its first character, so a
 * string is read as it is, and an array gives its first item.
 */
export default function getVOILUTFunction(voiLutModule?: {
  voiLUTFunction?: string | string[];
  voiLutFunction?: string;
}): string | undefined {
  const { voiLUTFunction, voiLutFunction } = voiLutModule ?? {};
  return (
    (Array.isArray(voiLUTFunction) ? voiLUTFunction[0] : voiLUTFunction) ||
    voiLutFunction ||
    undefined
  );
}
