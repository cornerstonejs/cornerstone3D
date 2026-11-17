export const UCUM_HOUNSFIELD_UNIT = "[hnsf'U]";
export const DISPLAY_HOUNSFIELD_UNIT = 'HU';
export const UCUM_SQUARE_MILLIMETER = 'mm2';
export const DISPLAY_SQUARE_MILLIMETER = 'mm²';
// Cornerstone reports SUV only for PT images prescaled with suvbw, so the
// display unit SUV is always the body weight SUV (DICOM CID 85).
export const UCUM_SUV_BODY_WEIGHT = 'g/ml{SUVbw}';
export const DISPLAY_SUV = 'SUV';

// The dcmjs library writes a unit it cannot map as the arbitrary unit [arb'U]{<unit>}
const ARBITRARY_UNIT_PATTERN = /^\[arb'U\]\{(.+)\}$/;

/**
 * Mapping from UCUM codes to display units.
 */
const UNIT_MAP_FROM_UCUM: Record<string, string> = {
  [UCUM_HOUNSFIELD_UNIT]: DISPLAY_HOUNSFIELD_UNIT,
  [UCUM_SQUARE_MILLIMETER]: DISPLAY_SQUARE_MILLIMETER,
  [UCUM_SUV_BODY_WEIGHT]: DISPLAY_SUV,
};

/**
 * Mapping from display units to UCUM codes, for the units that dcmjs
 * cannot map by itself.
 */
const UNIT_MAP_TO_UCUM: Record<string, string> = {
  [DISPLAY_SUV]: UCUM_SUV_BODY_WEIGHT,
};

/**
 * Converts a display unit to the UCUM code for the units that dcmjs does not
 * map by itself. Other units are returned unchanged so that dcmjs keeps
 * handling them.
 *
 * @param unit - The display unit (e.g., "SUV")
 * @returns The UCUM code (e.g., "g/ml{SUVbw}") or original unit if no mapping
 */
export function mapUnitToUCUM(unit: string | undefined): string | undefined {
  if (!unit) {
    return unit;
  }
  return UNIT_MAP_TO_UCUM[unit] || unit;
}

/**
 * Converts a UCUM code to display format.
 * An arbitrary unit written by dcmjs (e.g., "[arb'U]{BQML}") is returned as
 * the inner unit (e.g., "BQML"), so that saving it again gives the same code
 * and not a nested one. If no mapping exists, returns the original unit.
 *
 * @param unit - The UCUM code (e.g., "[hnsf'U]")
 * @returns The display unit (e.g., "HU") or original unit if no mapping
 */
export function mapUnitFromUCUM(unit: string | undefined): string | undefined {
  if (!unit) {
    return unit;
  }
  const arbitraryUnit = ARBITRARY_UNIT_PATTERN.exec(unit)?.[1];
  if (arbitraryUnit) {
    return arbitraryUnit;
  }
  return UNIT_MAP_FROM_UCUM[unit] || unit;
}
