import { addTypedProvider } from '../metaData';
import { DataSetIterator } from '../utilities/dicomStream/DataSetIterator';
import MetadataModules from '../enums/MetadataModules';
import parseImageId from '../utilities/parseImageId';
import getOverlayPlaneModule from './getOverlayPlaneModule';
import dataSetCacheManager from './loadedDataSets';

addTypedProvider(
  MetadataModules.OVERLAY_PLANE,
  (_next, imageId, _data, _options) => {
    const parsedImageId = parseImageId(imageId);
    let url = parsedImageId.url;

    if (parsedImageId.frame) {
      url = `${url}&frame=${parsedImageId.frame}`;
    }

    const dataSet = dataSetCacheManager.get(url);

    if (!dataSet) {
      return;
    }
    return getOverlayPlaneModule(dataSet);
  }
);

export function metadataDicomSource(next, imageId, data, options) {
  const parsedImageId = parseImageId(imageId);

  const url = parsedImageId.url;

  const dataSet = dataSetCacheManager.get(url);

  if (!dataSet) {
    return next(imageId, data, options);
  }

  return new DataSetIterator(dataSet);
}

addTypedProvider(MetadataModules.DICOM_SOURCE, metadataDicomSource);
