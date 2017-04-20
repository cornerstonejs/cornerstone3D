import * as metaData from './metaData';
import findIndexOfString from './findIndexOfString';
import getPixelData from './getPixelData';
import metaDataManager from './metaDataManager';
import loadImage from './loadImage';

export default {
  ...metaData,
  findIndexOfString,
  getPixelData,
  loadImage,
  metaDataManager
};
