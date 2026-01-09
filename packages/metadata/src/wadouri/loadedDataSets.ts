import type { DataSet } from 'dicom-parser';

export const loadedDataSets = new Map<
  string,
  { dataSet: DataSet; cacheCount: number }
>();

export function purgeLoadedDataSets() {
  loadedDataSets.clear();
}

export function setDataSet(imageId, dataSet) {
  loadedDataSets.set(imageId, { dataSet, cacheCount: 1 });
}

export function getDataSet(imageId) {
  return loadedDataSets.get(imageId)?.dataSet;
}

export default {
  loadedDataSets,
  purgeLoadedDataSets,
  set: setDataSet,
  get: getDataSet,
};
