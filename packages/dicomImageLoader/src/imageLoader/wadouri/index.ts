import {
  getImagePixelModule,
  getLUTs,
  getModalityLUTOutputPixelRepresentation,
  getNumberValues,
  metaDataProvider,
  metadataForDataset,
} from './metaData/index';

import dataSetCacheManager from './dataSetCacheManager';
import fileManager from './fileManager';
import getEncapsulatedImageFrame from './getEncapsulatedImageFrame';
import getUncompressedImageFrame from './getUncompressedImageFrame';
import loadFileRequest from './loadFileRequest';
import getPixelData from './getPixelData';
import {
  loadImageFromPromise,
  getLoaderForScheme,
  loadImage,
} from './loadImage';
import parseImageId from './parseImageId';
import unpackBinaryFrame from './unpackBinaryFrame';
import register from './register';

const metaData = {
  getImagePixelModule,
  getLUTs,
  getModalityLUTOutputPixelRepresentation,
  getNumberValues,
  metaDataProvider,
  metadataForDataset,
};

export default {
  metaData,
  dataSetCacheManager,
  fileManager,
  getEncapsulatedImageFrame,
  getUncompressedImageFrame,
  loadFileRequest,
  loadImageFromPromise,
  getLoaderForScheme,
  getPixelData,
  loadImage,
  parseImageId,
  unpackBinaryFrame,
  register,
};

export {
  metaData,
  dataSetCacheManager,
  fileManager,
  getEncapsulatedImageFrame,
  getUncompressedImageFrame,
  loadFileRequest,
  loadImageFromPromise,
  getLoaderForScheme,
  getPixelData,
  loadImage,
  parseImageId,
  unpackBinaryFrame,
  register,
};
