import { Enums, metaData } from '@cornerstonejs/core';
import * as dicomParser from 'dicom-parser';
import parseImageId from '../parseImageId';
import dataSetCacheManager from '../dataSetCacheManager';
import getOverlayPlaneModule from './getOverlayPlaneModule';
import {
  getImageTypeSubItemFromDataset,
  extractOrientationFromDataset,
  extractPositionFromDataset,
  extractSpacingFromDataset,
  extractSliceThicknessFromDataset,
} from './extractPositioningFromDataset';
import isNMReconstructable from '../../isNMReconstructable';
import { DataSetIterator } from './DataSetIterator';

const { MetadataModules } = Enums;

function metaDataProvider(type, imageId) {
  // Several providers use array queries
  if (Array.isArray(imageId)) {
    return;
  }

  const parsedImageId = parseImageId(imageId);
  let url = parsedImageId.url;

  if (parsedImageId.frame) {
    url = `${url}&frame=${parsedImageId.frame}`;
  }

  const dataSet = dataSetCacheManager.get(url);

  if (!dataSet) {
    return;
  }

  return metadataForDataset(type, imageId, dataSet);
}

export function metadataForDataset(
  type,
  _imageId,
  dataSet: dicomParser.DataSet
) {
  if (type === MetadataModules.NM_MULTIFRAME_GEOMETRY) {
    const modality = dataSet.string('x00080060');
    const imageSubType = getImageTypeSubItemFromDataset(dataSet, 2);

    return {
      modality,
      imageType: dataSet.string('x00080008'),
      imageSubType,
      imageOrientationPatient: extractOrientationFromDataset(dataSet),
      imagePositionPatient: extractPositionFromDataset(dataSet),
      sliceThickness: extractSliceThicknessFromDataset(dataSet),
      pixelSpacing: extractSpacingFromDataset(dataSet),
      numberOfFrames: dataSet.uint16('x00280008'),
      isNMReconstructable:
        isNMReconstructable(imageSubType) && modality.includes('NM'),
    };
  }

  if (type === MetadataModules.OVERLAY_PLANE) {
    return getOverlayPlaneModule(dataSet);
  }
}

export function metadataDicomSource(next, imageId, data, options) {
  const parsedImageId = parseImageId(imageId);

  const url = parsedImageId.url;

  const dataSet = dataSetCacheManager.get(url);

  if (!dataSet) {
    console.warn('***************** Empty dataset');
    return next(imageId, data, options);
  }

  return new DataSetIterator(dataSet);
}

metaData.addTypedProvider(MetadataModules.DICOM_SOURCE, metadataDicomSource);

export default metaDataProvider;
