import { addTypedProvider } from '../metaData';
import MetadataModules from '../enums/MetadataModules';
import { MetaDataIterator } from '../utilities/dicomStream/MetaDataIterator';
import { isVideoTransferSyntax } from '../utilities/isVideoTransferSyntax';

import getOverlayPlaneModule from './getOverlayPlaneModule';
import metaDataManager from './metaDataManager';
import getValue from './getValue';

/**
 * @deprecated
 */
function metaDataProvider(type, imageId) {
  console.error(
    'No wadors global metadata provider, please remove registration',
    type,
    imageId
  );
}

export function metadataDicomSource(next, imageId, data, options) {
  const metaData = metaDataManager.get(imageId);

  if (!metaData) {
    return next(imageId, data, options);
  }

  return new MetaDataIterator(metaData);
}

addTypedProvider(MetadataModules.DICOM_SOURCE, metadataDicomSource);

export function getImageUrlModule(imageId, metaData) {
  const { transferSyntaxUID } = getTransferSyntax(imageId, metaData);
  const isVideo = isVideoTransferSyntax(transferSyntaxUID);
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

export function bindMetadataProvider(provider) {
  return (next, imageId, data, options) => {
    const metaData = metaDataManager.get(imageId);
    if (!metaData) {
      return next(imageId, data, options);
    }
    return provider(imageId, metaData);
  };
}
addTypedProvider(
  MetadataModules.OVERLAY_PLANE,
  bindMetadataProvider((_imageId, metaData) => getOverlayPlaneModule(metaData))
);
addTypedProvider(
  MetadataModules.IMAGE_URL,
  bindMetadataProvider(getImageUrlModule)
);

/**
 * @deprecated
 */
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
