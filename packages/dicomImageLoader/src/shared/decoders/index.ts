import { initialize as initializeHTJ2K } from './decodeHTJ2K';
import { initialize as initializeJPEG2000 } from './decodeJPEG2000';
import { initialize as initializeJPEGLS } from './decodeJPEGLS';
import { initialize as initializeJPEGBaseline12Bit } from './decodeJPEGBaseline12Bit-js';
import { initialize as initializeJPEGLossless } from './decodeJPEGLossless';
import { initialize as initLibjpegTurbo } from './decodeJPEGBaseline8Bit';

import decodeHTJ2K from './decodeHTJ2K';
import decodeJPEG2000 from './decodeJPEG2000';
import decodeJPEGLS from './decodeJPEGLS';
import decodeJPEGBaseline12Bit from './decodeJPEGBaseline12Bit-js';
import decodeJPEGLossless from './decodeJPEGLossless';
import decodeJPEGBaseline8Bit from './decodeJPEGBaseline8Bit';
import decodeBigEndian from './decodeBigEndian';
import decodeLittleEndian from './decodeLittleEndian';
import decodeRLE from './decodeRLE';

const initializers = {
  HTJ2K: initializeHTJ2K,
  JPEG2000: initializeJPEG2000,
  JPEGLS: initializeJPEGLS,
  JPEGBaseline12Bit: initializeJPEGBaseline12Bit,
  JPEGLossless: initializeJPEGLossless,
  JPEGBaseline8Bit: initLibjpegTurbo,
};

const decoders = {
  HTJ2K: decodeHTJ2K,
  JPEG2000: decodeJPEG2000,
  JPEGLS: decodeJPEGLS,
  JPEGBaseline12Bit: decodeJPEGBaseline12Bit,
  JPEGLossless: decodeJPEGLossless,
  JPEGBaseline8Bit: decodeJPEGBaseline8Bit,
  BigEndian: decodeBigEndian,
  LittleEndian: decodeLittleEndian,
  RLE: decodeRLE,
};

export { initializers, decoders };
