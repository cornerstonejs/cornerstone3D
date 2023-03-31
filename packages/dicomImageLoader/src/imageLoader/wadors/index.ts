import {
  getNumberString,
  getNumberValue,
  getNumberValues,
  getValue,
  metaDataProvider,
} from './metaData/index';

import findIndexOfString from './findIndexOfString';
import getPixelData from './getPixelData';
import metaDataManager from './metaDataManager';
import loadImage from './loadImage';
import register from './register';

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
