import type { WADORSMetaDataElement } from '../types/WADORSMetaData';
import getValue from './getValue';

export function getNumberValue(
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
