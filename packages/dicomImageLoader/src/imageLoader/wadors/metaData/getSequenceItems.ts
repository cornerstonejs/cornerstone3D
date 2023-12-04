import { WADORSMetaDataElement } from 'dicomImageLoader/src/types';

function getSequenceItems(element: any): WADORSMetaDataElement[] {
  if (!element) {
    return;
  }
  // Value is not present if the attribute has a zero length value
  if (!element.Value) {
    return;
  }
  // Make sure the Value is an array
  if (!Array.isArray(element.Value)) {
    return;
  }

  return element.Value;
}

export default getSequenceItems;
