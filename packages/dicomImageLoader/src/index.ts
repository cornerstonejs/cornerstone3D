import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
} from './imageLoader/colorSpaceConverters/index';

import { default as wadouri } from './imageLoader/wadouri/index';
import { default as wadors } from './imageLoader/wadors/index';
import { default as init } from './init';
import { default as convertColorSpace } from './imageLoader/convertColorSpace';
import { default as createImage } from './imageLoader/createImage';
import { default as decodeJPEGBaseline8BitColor } from './imageLoader/decodeJPEGBaseline8BitColor';
import { default as getImageFrame } from './imageLoader/getImageFrame';
import { default as getMinMax } from './shared/getMinMax';
import { default as isColorImage } from './shared/isColorImage';
import { default as isJPEGBaseline8BitColor } from './imageLoader/isJPEGBaseline8BitColor';
import { default as getPixelData } from './imageLoader/wadors/getPixelData';
import { internal } from './imageLoader/internal/index';
import * as constants from './constants';
import type * as Types from './types';
import { decodeImageFrame } from './decodeImageFrameWorker';
import { initializers } from './shared/decoders';
import * as utilities from './shared';

const cornerstoneDICOMImageLoader = {
  constants,
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
  wadouri,
  wadors,
  init,
  utilities,
  convertColorSpace,
  createImage,
  decodeJPEGBaseline8BitColor,
  getImageFrame,
  getPixelData,
  getMinMax,
  isColorImage,
  isJPEGBaseline8BitColor,
  internal,
  decodeImageFrame,
  initializers,
};

export {
  constants,
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
  wadouri,
  wadors,
  utilities,
  init,
  convertColorSpace,
  createImage,
  decodeJPEGBaseline8BitColor,
  getImageFrame,
  getPixelData,
  getMinMax,
  isColorImage,
  isJPEGBaseline8BitColor,
  internal,
  decodeImageFrame,
  initializers,
};

export type { Types };

export default cornerstoneDICOMImageLoader;
