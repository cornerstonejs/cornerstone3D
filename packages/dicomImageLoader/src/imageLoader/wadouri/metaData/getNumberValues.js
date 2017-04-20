"use strict";

function getNumberValues(dataSet, tag, minimumLength) {
  var values = [];
  var valueAsString = dataSet.string(tag);
  if(!valueAsString) {
    return;
  }
  var split = valueAsString.split('\\');
  if(minimumLength && split.length < minimumLength) {
    return;
  }
  for(var i=0;i < split.length; i++) {
    values.push(parseFloat(split[i]));
  }
  return values;
}

export default getNumberValues;
