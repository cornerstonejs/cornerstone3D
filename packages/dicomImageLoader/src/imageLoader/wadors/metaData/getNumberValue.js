import getValue from './getValue';

"use strict";

function getNumberValue(element, index) {
  var value = getValue(element, index);
  if(value === undefined) {
    return;
  }
  return parseFloat(value);
}

export default getNumberValue;
