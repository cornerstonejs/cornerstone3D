import {
  Enums,
  utilities,
  metaData as coreMetaData,
} from '@cornerstonejs/core';
import getNumberValues from './getNumberValues';
import getNumberValue from './getNumberValue';
import getOverlayPlaneModule from './getOverlayPlaneModule';
import metaDataManager from '../metaDataManager';
import getValue from './getValue';
import {
  extractOrientationFromMetadata,
  extractPositionFromMetadata,
} from './extractPositioningFromMetadata';
import { getImageTypeSubItemFromMetadata } from './NMHelpers';
import isNMReconstructable from '../../isNMReconstructable';
import { MetaDataIterator } from './MetaDataIterator';

const { MetadataModules } = Enums;

function metaDataProvider(type, imageId) {
  const { MetadataModules } = Enums;

  const metaData = metaDataManager.get(imageId);

  if (!metaData) {
    return;
  }

  if (type === MetadataModules.NM_MULTIFRAME_GEOMETRY) {
    const modality = getValue(metaData['00080060']) as string;
    const imageSubType = getImageTypeSubItemFromMetadata(metaData, 2);

    return {
      modality,
      imageType: getValue(metaData['00080008']),
      imageSubType,
      imageOrientationPatient: extractOrientationFromMetadata(metaData),
      imagePositionPatient: extractPositionFromMetadata(metaData),
      sliceThickness: getNumberValue(metaData['00180050']),
      spacingBetweenSlices: getNumberValue(metaData['00180088']),
      pixelSpacing: getNumberValues(metaData['00280030'], 2),
      numberOfFrames: getNumberValue(metaData['00280008']),
      isNMReconstructable:
        isNMReconstructable(imageSubType) && modality.includes('NM'),
    };
  }

  if (type === MetadataModules.IMAGE_URL) {
    return getImageUrlModule(imageId, metaData);
  }

  if (type === MetadataModules.OVERLAY_PLANE) {
    return getOverlayPlaneModule(metaData);
  }
}

export function metadataDicomSource(next, imageId, data, options) {
  const metaData = metaDataManager.get(imageId);

  if (!metaData) {
    return next(imageId, data, options);
  }

  return new MetaDataIterator(metaData);
}

coreMetaData.addTypedProvider(
  MetadataModules.DICOM_SOURCE,
  metadataDicomSource
);

export function getImageUrlModule(imageId, metaData) {
  const { transferSyntaxUID } = getTransferSyntax(imageId, metaData);
  const isVideo = utilities.isVideoTransferSyntax(transferSyntaxUID);
  const imageUrl = imageId.substring(7);
  const thumbnail = imageUrl.replace('/frames/', '/thumbnail/');
  let rendered = imageUrl.replace('/frames/', '/rendered/');
  if (isVideo) {
    rendered = rendered.replace('/rendered/1', '/rendered');
  }
  return {
    isVideo,
    rendered,
    thumbnail,
  };
}

export function getCineModule(_imageId, metaData) {
  const cineRate = getValue<string>(metaData['00180040']);
  return {
    cineRate,
    numberOfFrames: getNumberValue(metaData['00280008']),
  };
}

export function getTransferSyntax(_imageId, metaData) {
  // Use either the FMI, which is NOT permitted in the DICOMweb data, but
  // is sometimes found there anyways, or the available transfer syntax, which
  // is the recommended way of getting it.
  return {
    transferSyntaxUID:
      getValue<string>(metaData['00020010']) ||
      getValue<string>(metaData['00083002']),
  };
}

export default metaDataProvider;
