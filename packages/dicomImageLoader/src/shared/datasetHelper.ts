/**
 * This helper utility defines methods for reading from a DicomParser defined
 * dataset objects, for use by the Modules and Tags registry.
 * TODO: Modify these functions to accept the default configuration values
 * on the base ITag instance to automatically choose between vm=1 and vm>1
 * single/multiple values, as well as creating an optional vm=1 item which allows
 * for returning a singleton Number/String object with a .array entry for the full
 * dataset.
 */
import getNumberValues from '../imageLoader/wadouri/metaData/getNumberValues';

function bindFromDataset<T>(method, defaultIndex = 0) {
  return function (dataSet, _index = defaultIndex) {
    if (!dataSet[method]) {
      console.warn('method', method);
      throw new Error(`Method ${method} is not a member of dataSet`);
    }
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
    if (!item.double) {
      console.error(
        'Mangled (multiframe) dataset value for',
        this.name,
        this.xTag
      );
      return;
    }
    result.push(this.moduleStatic.createSqDataset(this, item, options));
  }
  return result;
}
