import {
  getNumberString,
  getNumberValue,
  getNumberValues,
  getValue,
  metaDataProvider,
} from './metaData/index.js';

import findIndexOfString from './findIndexOfString.js';
import getPixelData from './getPixelData.js';
import metaDataManager from './metaDataManager.js';
import loadImage from './loadImage.js';
import register from './register.js';

const metaData = {
  getNumberString,
  getNumberValue,
  getNumberValues,
  getValue,
  metaDataProvider,
};

export default {
  metaData,
  findIndexOfString,
  getPixelData,
  loadImage,
  metaDataManager,
  register,
};
