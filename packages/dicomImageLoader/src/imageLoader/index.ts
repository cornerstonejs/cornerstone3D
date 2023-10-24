import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
} from './colorSpaceConverters/index';

import { default as wadouri } from './wadouri/index';
import { default as wadors } from './wadors/index';
import { default as configure } from './configure';
import { default as convertColorSpace } from './convertColorSpace';
import { default as createImage } from './createImage';
import { default as decodeJPEGBaseline8BitColor } from './decodeJPEGBaseline8BitColor';
import { default as getImageFrame } from './getImageFrame';
import { default as getMinMax } from '../shared/getMinMax';
import { default as isColorImage } from '../shared/isColorImage';
import { default as isJPEGBaseline8BitColor } from './isJPEGBaseline8BitColor';
import { default as getPixelData } from './wadors/getPixelData';
import { internal } from './internal/index';
import { default as external } from '../externalModules';

const cornerstoneDICOMImageLoader = {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
  wadouri,
  wadors,
  configure,
  convertColorSpace,
  createImage,
  decodeJPEGBaseline8BitColor,
  getImageFrame,
  getPixelData,
  getMinMax,
  isColorImage,
  isJPEGBaseline8BitColor,
  internal,
  external,
};

export {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
  wadouri,
  wadors,
  configure,
  convertColorSpace,
  createImage,
  decodeJPEGBaseline8BitColor,
  getImageFrame,
  getPixelData,
  getMinMax,
  isColorImage,
  isJPEGBaseline8BitColor,
  internal,
  external,
};

export default cornerstoneDICOMImageLoader;
