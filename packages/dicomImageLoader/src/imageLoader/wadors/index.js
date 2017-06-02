import { getNumberString,
         getNumberValue,
         getNumberValues,
         getValue,
         metaDataProvider } from './metaData';

import findIndexOfString from './findIndexOfString';
import getPixelData from './getPixelData';
import metaDataManager from './metaDataManager';
import loadImage from './loadImage';

const metaData = {
  getNumberString,
  getNumberValue,
  getNumberValues,
  getValue,
  metaDataProvider
};

export default {
  metaData,
  findIndexOfString,
  getPixelData,
  loadImage,
  metaDataManager
};
