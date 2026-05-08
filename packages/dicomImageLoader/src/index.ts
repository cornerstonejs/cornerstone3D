import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPaletteColor,
  convertPaletteColorWithFetch,
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
import {
  decodeImageFrame,
  postProcessDecodedPixels,
} from './decodeImageFrameWorker';
import { initializers, decoders } from './shared/decoders';

const cornerstoneDICOMImageLoader = {
  constants,
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPaletteColor,
  convertPaletteColorWithFetch,
  wadouri,
  wadors,
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
  postProcessDecodedPixels,
  initializers,
  decoders,
};

export {
  constants,
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPaletteColor,
  convertPaletteColorWithFetch,
  wadouri,
  wadors,
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
  postProcessDecodedPixels,
  initializers,
  decoders,
};

export type { Types };

export default cornerstoneDICOMImageLoader;
