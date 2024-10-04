import getNumberString from './metaData/getNumberString';
import getNumberValue from './metaData/getNumberValue';
import getNumberValues from './metaData/getNumberValues';
import getValue from './metaData/getValue';
import metaDataProvider from './metaData/metaDataProvider';
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
