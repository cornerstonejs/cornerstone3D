function getNumberValues(dataSet, tag, minimumLength) {
  const values = [];
  const valueAsString = dataSet.string(tag);

  if (!valueAsString) {
    return;
  }
  const split = valueAsString.split('\\');

  if (minimumLength && split.length < minimumLength) {
    return;
  }
  for (let i = 0; i < split.length; i++) {
    values.push(parseFloat(split[i]));
  }

  return values;
}

export default getNumberValues;
