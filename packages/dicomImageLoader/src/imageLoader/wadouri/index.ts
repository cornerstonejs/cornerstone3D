import {
  getImagePixelModule,
  getLUTs,
  getModalityLUTOutputPixelRepresentation,
  getNumberValues,
  metaDataProvider,
} from './metaData/index';

import dataSetCacheManager from './dataSetCacheManager';
import fileManager from './fileManager';
import getEncapsulatedImageFrame from './getEncapsulatedImageFrame';
import getUncompressedImageFrame from './getUncompressedImageFrame';
import loadFileRequest from './loadFileRequest';
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
  loadImage,
  parseImageId,
  unpackBinaryFrame,
  register,
};
