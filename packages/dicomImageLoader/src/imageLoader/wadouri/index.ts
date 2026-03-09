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
  loadImageFromNatural,
} from './loadImage';
import parseImageId from './parseImageId';
import {
  getCompressedFrameData,
  compressedFrameData,
  type CompressedFrameDataValue,
} from '@cornerstonejs/metadata/utilities/metadataProvider';
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
  loadImageFromNatural,
  parseImageId,
  unpackBinaryFrame,
  register,
  getCompressedFrameData,
  compressedFrameData,
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
  loadImageFromNatural,
  parseImageId,
  unpackBinaryFrame,
  register,
  getCompressedFrameData,
  compressedFrameData,
  type CompressedFrameDataValue,
};
