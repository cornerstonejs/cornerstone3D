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
 * Converts a UCUM code to display format.
 * If no mapping exists, returns the original unit.
 *
 * @param unit - The UCUM code (e.g., "[hnsf'U]")
 * @returns The display unit (e.g., "HU") or original unit if no mapping
 */
export function mapUnitFromUCUM(unit: string | undefined): string | undefined {
  if (!unit) {
    return unit;
  }
  return UNIT_MAP_FROM_UCUM[unit] || unit;
}
