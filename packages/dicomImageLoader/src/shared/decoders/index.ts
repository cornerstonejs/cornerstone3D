import { initialize as initializeHTJ2K } from './decodeHTJ2K';
import { initialize as initializeJPEG2000 } from './decodeJPEG2000';
import { initialize as initializeJPEGLS } from './decodeJPEGLS';
import { initialize as initializeJPEGBaseline12Bit } from './decodeJPEGBaseline12Bit-js';
import { initialize as initializeJPEGLossless } from './decodeJPEGLossless';

const initializers = {
  HTJ2K: initializeHTJ2K,
  JPEG2000: initializeJPEG2000,
  JPEGLS: initializeJPEGLS,
  JPEGBaseline12Bit: initializeJPEGBaseline12Bit,
  JPEGLossless: initializeJPEGLossless,
};

export { initializers };
