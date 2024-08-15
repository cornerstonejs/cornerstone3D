import type { WADORSMetaDataElement } from '../../../types';

/**
 * Returns the raw value
 *
 * @param element - The javascript object for the specified element in the metadata
 * @param [index] - the index of the value in a multi-valued element, default is 0
 * @param [defaultValue] - The default value to return if the element does not exist
 * @returns {*}
 */
function getValue<ReturnType = unknown>(
  element: WADORSMetaDataElement,
  index?: number,
  defaultValue?: ReturnType
): ReturnType {
  index = index || 0;
  if (!element) {
    return defaultValue;
  }
  // Value is not present if the attribute has a zero length value
  if (!element.Value) {
    return defaultValue;
  }
  // make sure we have the specified index
  if (Array.isArray(element.Value) && element.Value.length <= index) {
    return defaultValue;
  }

  return element.Value[index] as ReturnType;
}

export default getValue;
