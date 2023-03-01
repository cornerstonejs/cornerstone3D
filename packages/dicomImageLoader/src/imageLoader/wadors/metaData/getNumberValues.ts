import { WADORSMetaDataElement } from '../../../types';

/**
 * Returns the values as an array of javascript numbers
 *
 * @param element - The javascript object for the specified element in the metadata
 * @param [minimumLength] - the minimum number of values
 * @returns {*}
 */
function getNumberValues(
  element: WADORSMetaDataElement,
  minimumLength?: number
): number[] {
  if (!element) {
    return;
  }
  // Value is not present if the attribute has a zero length value
  if (!element.Value) {
    return;
  }
  // make sure we have the expected length
  if (minimumLength && (element.Value as any).length < minimumLength) {
    return;
  }

  const values: number[] = [];

  for (let i = 0; i < (element.Value as any).length; i++) {
    values.push(parseFloat(element.Value[i] as string));
  }

  return values;
}

export default getNumberValues;
