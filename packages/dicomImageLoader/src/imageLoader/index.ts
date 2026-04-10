import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPaletteColor,
  convertPaletteColorWithFetch,
} from './colorSpaceConverters/index';

import { default as wadouri } from './wadouri/index';
import { default as wadors } from './wadors/index';
import { default as init } from '../init';
import { default as convertColorSpace } from './convertColorSpace';
import { default as createImage } from './createImage';
import { default as decodeJPEGBaseline8BitColor } from './decodeJPEGBaseline8BitColor';
import { default as getImageFrame } from './getImageFrame';
import { default as getMinMax } from '../shared/getMinMax';
import { default as isColorImage } from '../shared/isColorImage';
import { default as isJPEGBaseline8BitColor } from './isJPEGBaseline8BitColor';
import { default as getPixelData } from './wadors/getPixelData';
import { default as getScalingParameters } from './getScalingParameters';
import { default as isColorConversionRequired } from './isColorConversionRequired';
import { default as removeAFromRGBA } from './removeAFromRGBA';
import { default as isModalityLUTForDisplay } from './isModalityLutForDisplay';
import { default as setPixelDataType } from './setPixelDataType';
import { internal } from './internal/index';

const cornerstoneDICOMImageLoader = {
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
  getScalingParameters,
  isColorConversionRequired,
  removeAFromRGBA,
  isModalityLUTForDisplay,
  setPixelDataType,
  internal,
};

export {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFullByPlane,
  convertPaletteColorWithFetch,
  convertPaletteColor,
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
};

export default cornerstoneDICOMImageLoader;
