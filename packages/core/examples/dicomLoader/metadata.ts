import type { DataSet } from 'dicom-parser';

const activeDatasets: Record<string, DataSet> = {};

export function addToCache(imageId: string, dataSet: DataSet) {
  activeDatasets[imageId] = dataSet;
}

export function dropFromCache(imageId: string) {
  delete activeDatasets[imageId];
}

export function getFromCache(imageId: string) {
  return activeDatasets[imageId];
}
