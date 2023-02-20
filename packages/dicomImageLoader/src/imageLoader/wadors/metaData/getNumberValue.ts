import getValue from './getValue.js';

function getNumberValue(element, index) {
  const value = getValue(element, index);

  if (value === undefined) {
    return;
  }

  return parseFloat(value);
}

export default getNumberValue;
