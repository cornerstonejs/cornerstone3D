import type { WADORSMetaDataElement } from '../../../types';
import getValue from './getValue';

function getNumberValue(
  element: WADORSMetaDataElement,
  index?: number
): number {
  const value = getValue(element, index) as string;

  if (value === undefined) {
    return;
  }

  return parseFloat(value);
}

export default getNumberValue;
