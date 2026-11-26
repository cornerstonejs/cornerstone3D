export const UCUM_HOUNSFIELD_UNIT = "[hnsf'U]";
export const DISPLAY_HOUNSFIELD_UNIT = 'HU';
export const UCUM_SQUARE_MILLIMETER = 'mm2';
export const DISPLAY_SQUARE_MILLIMETER = 'mm²';

/**
 * Mapping from UCUM codes to display units.
 */
const UNIT_MAP_FROM_UCUM: Record<string, string> = {
  [UCUM_HOUNSFIELD_UNIT]: DISPLAY_HOUNSFIELD_UNIT,
  [UCUM_SQUARE_MILLIMETER]: DISPLAY_SQUARE_MILLIMETER,
};

/**
 * dcmjs writes a unit it has no UCUM code for (SUV, raw, cm US Region...) as
 * the arbitrary unit "[arb'U]{<unit>}".
 */
const ARBITRARY_UNIT = /^\[arb'U\]\{(.*)\}$/;

/**
 * Converts a UCUM code to display format.
 * An arbitrary unit written by dcmjs gives back the unit it wraps.
 * If no mapping exists, returns the original unit.
 *
 * @param unit - The UCUM code (e.g., "[hnsf'U]")
 * @returns The display unit (e.g., "HU") or original unit if no mapping
 */
export function mapUnitFromUCUM(unit: string | undefined): string | undefined {
  if (!unit) {
    return unit;
  }
  const arbitrary = ARBITRARY_UNIT.exec(unit);
  if (arbitrary) {
    return arbitrary[1];
  }
  return UNIT_MAP_FROM_UCUM[unit] || unit;
}
