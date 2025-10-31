import getNumberValues from '../imageLoader/wadouri/metaData/getNumberValues';

function bindFromDataset<T>(method, defaultIndex = 0) {
  return function (dataSet, _index = defaultIndex) {
    return dataSet[method](this.xTag) as T;
  };
}

export const stringDataset = bindFromDataset<string>('string');
export const floatStringDataset = bindFromDataset<number>('floatString');
export const doubleDataset = bindFromDataset<number>('double');
export const uint16Dataset = bindFromDataset<number>('uint16');
export const int32Dataset = bindFromDataset<number>('int32');
export const floatStringsDataset = function (dataSet) {
  return getNumberValues(dataSet, this.xTag, 0);
};

export function datasetSQ(dataSet, options?) {
  const sequence = dataSet.elements[this.xTag];
  if (!sequence || !sequence.items) {
    return;
  }
  const result = [];

  for (const item of sequence.items) {
    this.moduleStatic.createSqDataset(this, item, options);
  }
  return result;
}
