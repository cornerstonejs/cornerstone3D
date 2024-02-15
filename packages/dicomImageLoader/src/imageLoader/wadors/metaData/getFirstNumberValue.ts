import getNumberValues from './getNumberValues';

/**
 * This helper function retrieves the first number value from the provided sequence for the given key.
 * @param sequence - The sequence from which to retrieve the number value.
 * @param key - The key for which to retrieve the number value.
 * @returns The first number value for the given key, or null if no value is found.
 */
function getFirstNumberValue(sequence: any, key: string): number | null {
  const values = getNumberValues(sequence[key]);
  return values ? values[0] : null;
}

export { getFirstNumberValue };
