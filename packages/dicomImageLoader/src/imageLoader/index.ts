import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
} from './colorSpaceConverters/index.js';

import { default as wadouri } from './wadouri/index.js';
import { default as wadors } from './wadors/index.js';
import { default as configure } from './configure.js';
import { default as convertColorSpace } from './convertColorSpace.js';
import { default as createImage } from './createImage.js';
import { default as decodeImageFrame } from './decodeImageFrame.js';
import { default as decodeJPEGBaseline8BitColor } from './decodeJPEGBaseline8BitColor.js';
import { default as getImageFrame } from './getImageFrame.js';
import { default as getMinMax } from '../shared/getMinMax.js';
import { default as isColorImage } from './isColorImage.js';
import { default as isJPEGBaseline8BitColor } from './isJPEGBaseline8BitColor.js';
import { default as webWorkerManager } from './webWorkerManager.js';
import { default as getPixelData } from './wadors/getPixelData.js';
import { internal } from './internal/index.js';
import { default as external } from '../externalModules.js';

const cornerstoneWADOImageLoader = {
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
  decodeImageFrame,
  decodeJPEGBaseline8BitColor,
  getImageFrame,
  getPixelData,
  getMinMax,
  isColorImage,
  isJPEGBaseline8BitColor,
  webWorkerManager,
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
  decodeImageFrame,
  decodeJPEGBaseline8BitColor,
  getImageFrame,
  getPixelData,
  getMinMax,
  isColorImage,
  isJPEGBaseline8BitColor,
  webWorkerManager,
  internal,
  external,
};

export default cornerstoneWADOImageLoader;
