import type { WADORSMetaDataElement } from '../../../types';
import getValue from './getValue';

/**
 * Returns the first string value as a Javascript number
 *
 * @param element - The javascript object for the specified element in the metadata
 * @param [index] - the index of the value in a multi-valued element, default is 0
 * @param [defaultValue] - The default value to return if the element does not exist
 * @returns {*}
 */
function getNumberString(
  element: WADORSMetaDataElement,
  index: number,
  defaultValue: number
): number {
  const value = getValue<string | number>(element, index, defaultValue);

  if (value === undefined) {
    return;
  }

  return parseFloat(String(value));
}

export default getNumberString;
