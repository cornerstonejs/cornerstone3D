/* eslint-disable complexity */
import decodeLittleEndian from './decoders/decodeLittleEndian.js';
import decodeBigEndian from './decoders/decodeBigEndian.js';
import decodeRLE from './decoders/decodeRLE.js';
import decodeJPEGBaseline8Bit from './decoders/decodeJPEGBaseline8Bit.js';
// import decodeJPEGBaseline12Bit from './decoders/decodeJPEGBaseline12Bit.js';
import decodeJPEGBaseline12Bit from './decoders/decodeJPEGBaseline12Bit-js.js';
import decodeJPEGLossless from './decoders/decodeJPEGLossless.js';
import decodeJPEGLS from './decoders/decodeJPEGLS.js';
import decodeJPEG2000 from './decoders/decodeJPEG2000.js';
import decodeHTJ2K from './decoders/decodeHTJ2K.js';
import scaleArray from './scaling/scaleArray.js';

/**
 * Decodes the provided image frame.
 * This is an async function return the result, or you can provide an optional
 * callbackFn that is called with the results.
 */
async function decodeImageFrame(
  imageFrame,
  transferSyntax,
  pixelData,
  decodeConfig,
  options,
  callbackFn
) {
  const start = new Date().getTime();

  let decodePromise = null;

  let opts;

  switch (transferSyntax) {
    case '1.2.840.10008.1.2':
    case '1.2.840.10008.1.2.1':
      // Implicit or Explicit VR Little Endian
      decodePromise = decodeLittleEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.2':
      // Explicit VR Big Endian (retired)
      decodePromise = decodeBigEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.1.99':
      // Deflate transfer syntax (deflated by dicomParser)
      decodePromise = decodeLittleEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.5':
      // RLE Lossless
      decodePromise = decodeRLE(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.50':
      // JPEG Baseline lossy process 1 (8 bit)
      opts = {
        ...imageFrame,
      };

      decodePromise = decodeJPEGBaseline8Bit(pixelData, opts);
      break;
    case '1.2.840.10008.1.2.4.51':
      // JPEG Baseline lossy process 2 & 4 (12 bit)
      // opts = {
      //   ...imageFrame,
      // };
      // decodePromise = decodeJPEGBaseline12Bit(pixelData, opts);
      //throw new Error('Currently unsupported: 1.2.840.10008.1.2.4.51');
      decodePromise = decodeJPEGBaseline12Bit(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.57':
      // JPEG Lossless, Nonhierarchical (Processes 14)
      decodePromise = decodeJPEGLossless(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.70':
      // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
      decodePromise = decodeJPEGLossless(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.80':
      // JPEG-LS Lossless Image Compression
      opts = {
        signed: imageFrame.pixelRepresentation === 1, // imageFrame.signed,
        // shouldn't need...
        bytesPerPixel: imageFrame.bitsAllocated <= 8 ? 1 : 2,
        ...imageFrame,
      };

      decodePromise = decodeJPEGLS(pixelData, opts);
      break;
    case '1.2.840.10008.1.2.4.81':
      // JPEG-LS Lossy (Near-Lossless) Image Compression
      opts = {
        signed: false, // imageFrame.signed,
        // shouldn't need...
        bytesPerPixel: imageFrame.bitsAllocated <= 8 ? 1 : 2,
        ...imageFrame,
      };

      decodePromise = decodeJPEGLS(pixelData, opts);
      break;
    case '1.2.840.10008.1.2.4.90':
      opts = {
        ...imageFrame,
      };

      // JPEG 2000 Lossless
      // imageFrame, pixelData, decodeConfig, options
      decodePromise = decodeJPEG2000(pixelData, opts);
      break;
    case '1.2.840.10008.1.2.4.91':
      // JPEG 2000 Lossy
      opts = {
        ...imageFrame,
      };

      // JPEG 2000 Lossy
      // imageFrame, pixelData, decodeConfig, options
      decodePromise = decodeJPEG2000(pixelData, opts);
      break;
    case '3.2.840.10008.1.2.4.96':
      // HTJ2K
      opts = {
        ...imageFrame,
      };

      decodePromise = decodeHTJ2K(pixelData, opts);
      break;
    default:
      throw new Error(`no decoder for transfer syntax ${transferSyntax}`);
  }

  /* Don't know if these work...
   // JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)
   else if(transferSyntax === "1.2.840.10008.1.2.4.92")
   {
   return decodeJPEG2000(dataSet, frame);
   }
   // JPEG 2000 Part 2 Multicomponent Image Compression
   else if(transferSyntax === "1.2.840.10008.1.2.4.93")
   {
   return decodeJPEG2000(dataSet, frame);
   }
   */

  if (!decodePromise) {
    throw new Error('decodePromise not defined');
  }

  const decodedFrame = await decodePromise;

  const postProcessed = postProcessDecodedPixels(
    decodedFrame,
    options,
    start,
    decodeConfig
  );

  // Call the callbackFn to agree with older arguments
  callbackFn?.(postProcessed);

  return postProcessed;
}

function postProcessDecodedPixels(imageFrame, options, start, decodeConfig) {
  const { use16BitDataType } = decodeConfig || {};

  const shouldShift =
    imageFrame.pixelRepresentation !== undefined &&
    imageFrame.pixelRepresentation === 1;
  const shift =
    shouldShift && imageFrame.bitsStored !== undefined
      ? 32 - imageFrame.bitsStored
      : undefined;

  if (shouldShift && shift !== undefined) {
    for (let i = 0; i < imageFrame.pixelData.length; i++) {
      // eslint-disable-next-line no-bitwise
      imageFrame.pixelData[i] = (imageFrame.pixelData[i] << shift) >> shift;
    }
  }

  // Cache the pixelData reference quickly incase we want to set a targetBuffer _and_ scale.
  let pixelDataArray = imageFrame.pixelData;

  imageFrame.pixelDataLength = imageFrame.pixelData.length;

  if (options.targetBuffer) {
    let offset, length;
    // If we have a target buffer, write to that instead. This helps reduce memory duplication.

    ({ offset, length } = options.targetBuffer);
    const { arrayBuffer, type } = options.targetBuffer;

    let TypedArrayConstructor;

    if (offset === null || offset === undefined) {
      offset = 0;
    }

    if ((length === null || length === undefined) && offset !== 0) {
      length = imageFrame.pixelDataLength - offset;
    } else if (length === null || length === undefined) {
      length = imageFrame.pixelDataLength;
    }

    switch (type) {
      case 'Uint8Array':
        TypedArrayConstructor = Uint8Array;
        break;
      case use16BitDataType && 'Uint16Array':
        TypedArrayConstructor = Uint16Array;
        break;
      case use16BitDataType && 'Int16Array':
        TypedArrayConstructor = Int16Array;
        break;
      case 'Float32Array':
        TypedArrayConstructor = Float32Array;
        break;
      default:
        throw new Error('target array for image does not have a valid type.');
    }

    const imageFramePixelData = imageFrame.pixelData;

    if (length !== imageFramePixelData.length) {
      throw new Error(
        `target array for image does not have the same length (${length}) as the decoded image length (${imageFramePixelData.length}).`
      );
    }

    // TypedArray.Set is api level and ~50x faster than copying elements even for
    // Arrays of different types, which aren't simply memcpy ops.
    let typedArray;

    if (arrayBuffer) {
      typedArray = new TypedArrayConstructor(arrayBuffer, offset, length);
    } else {
      typedArray = new TypedArrayConstructor(length);
    }

    typedArray.set(imageFramePixelData, 0);

    // If need to scale, need to scale correct array.
    pixelDataArray = typedArray;
  }

  if (options.preScale.enabled) {
    const scalingParameters = options.preScale.scalingParameters;

    if (!scalingParameters) {
      throw new Error(
        'options.preScale.scalingParameters must be defined if preScale.enabled is true, and scalingParameters cannot be derived from the metadata providers.'
      );
    }

    const { rescaleSlope, rescaleIntercept } = scalingParameters;

    if (
      typeof rescaleSlope === 'number' &&
      typeof rescaleIntercept === 'number'
    ) {
      if (scaleArray(pixelDataArray, scalingParameters)) {
        imageFrame.preScale = {
          ...options.preScale,
          scaled: true,
        };
      }
    }
  }

  // Handle cases where the targetBuffer is not backed by a SharedArrayBuffer
  if (
    options.targetBuffer &&
    (!options.targetBuffer.arrayBuffer ||
      options.targetBuffer.arrayBuffer instanceof ArrayBuffer)
  ) {
    imageFrame.pixelData = pixelDataArray;
  }

  const end = new Date().getTime();

  imageFrame.decodeTimeInMS = end - start;

  return imageFrame;
}

export default decodeImageFrame;
