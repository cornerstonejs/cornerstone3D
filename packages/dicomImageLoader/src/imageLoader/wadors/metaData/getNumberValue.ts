import { WADORSMetaDataElement } from '../../../types';
import getValue from './getValue';

function getNumberValue(
  element: WADORSMetaDataElement,
  index?: number
): number {
  const value = getValue<any>(element, index);

  if (value === undefined) {
    return;
  }

  return parseFloat(value);
}

export default getNumberValue;
