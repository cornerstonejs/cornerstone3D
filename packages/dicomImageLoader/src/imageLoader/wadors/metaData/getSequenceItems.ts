import { WADORSMetaDataElement } from '../../../types';

function getSequenceItems(element: any): WADORSMetaDataElement[] {
  // Value is not present if the attribute has a zero length value
  if (!element?.Value?.length) {
    return [];
  }

  if (!Array.isArray(element.Value)) {
    // If the Value is an object, encapsulate it in an array and log a warning message
    if (typeof element.Value === 'object') {
      console.warn(
        'Warning: Value should be an array, but an object was found. Encapsulating the object in an array.'
      );
      return [element.Value];
    }
    return [];
  }
  return element.Value;
}

export default getSequenceItems;
