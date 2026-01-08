import { Enums, metaData, utilities } from '@cornerstonejs/core';
import * as dicomParser from 'dicom-parser';
import parseImageId from '../parseImageId';
import dataSetCacheManager from '../dataSetCacheManager';
import getOverlayPlaneModule from './getOverlayPlaneModule';

const {
  DicomStream: { DataSetIterator },
} = utilities;

const { MetadataModules } = Enums;

/**
 * @deprecated
 */
function metaDataProvider(type, imageId) {
  console.error(
    'metaDataProvider is deprecated in favor of typedProviders',
    type,
    imageId
  );
}

export function metadataForDataset(
  type,
  _imageId,
  dataSet: dicomParser.DataSet
) {
  if (type === MetadataModules.OVERLAY_PLANE) {
    return getOverlayPlaneModule(dataSet);
  }
}

metaData.addTypedProvider(
  MetadataModules.OVERLAY_PLANE,
  (next, imageId, data, options) => {
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

metaData.addTypedProvider(MetadataModules.DICOM_SOURCE, metadataDicomSource);

export default metaDataProvider;
