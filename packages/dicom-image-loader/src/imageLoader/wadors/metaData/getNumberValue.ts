import { WadoRsMetaDataElement } from '../wado-rs-metadata';
import getValue from './getValue';

function getNumberValue(
  element: WadoRsMetaDataElement,
  index?: number
): number {
  const value = getValue(element, index);

  if (value === undefined) {
    return;
  }

  return parseFloat(value);
}

export default getNumberValue;
