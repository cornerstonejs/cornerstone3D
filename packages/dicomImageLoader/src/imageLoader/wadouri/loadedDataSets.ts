import type { DataSet } from 'dicom-parser';

let loadedDataSets: Record<string, { dataSet: DataSet; cacheCount: number }> =
  {};

const purgeLoadedDataSets = () => {
  loadedDataSets = {};
};
export { loadedDataSets, purgeLoadedDataSets };
