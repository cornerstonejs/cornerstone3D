/* eslint-disable complexity */
import decodeLittleEndian from './decoders/decodeLittleEndian.js';
import decodeBigEndian from './decoders/decodeBigEndian.js';
import decodeRLE from './decoders/decodeRLE.js';
import decodeJPEGBaseline from './decoders/decodeJPEGBaseline.js';
import decodeJPEGLossless from './decoders/decodeJPEGLossless.js';
import decodeJPEGLS from './decoders/decodeJPEGLS.js';
import decodeJPEG2000 from './decoders/decodeJPEG2000.js';
import scaleArray from './scaling/scaleArray.js';

function decodeImageFrame(
  imageFrame,
  transferSyntax,
  pixelData,
  decodeConfig,
  options
) {
  const start = new Date().getTime();

  switch (transferSyntax) {
    case '1.2.840.10008.1.2':
      // Implicit VR Little Endian
      imageFrame = decodeLittleEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.1':
      // Explicit VR Little Endian
      imageFrame = decodeLittleEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.2':
      // Explicit VR Big Endian (retired)
      imageFrame = decodeBigEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.1.99':
      // Deflate transfer syntax (deflated by dicomParser)
      imageFrame = decodeLittleEndian(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.5':
      // RLE Lossless
      imageFrame = decodeRLE(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.50':
      // JPEG Baseline lossy process 1 (8 bit)
      imageFrame = decodeJPEGBaseline(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.51':
      // JPEG Baseline lossy process 2 & 4 (12 bit)
      imageFrame = decodeJPEGBaseline(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.57':
      // JPEG Lossless, Nonhierarchical (Processes 14)
      imageFrame = decodeJPEGLossless(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.70':
      // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
      imageFrame = decodeJPEGLossless(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.80':
      // JPEG-LS Lossless Image Compression
      imageFrame = decodeJPEGLS(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.81':
      // JPEG-LS Lossy (Near-Lossless) Image Compression
      imageFrame = decodeJPEGLS(imageFrame, pixelData);
      break;
    case '1.2.840.10008.1.2.4.90':
      // JPEG 2000 Lossless
      imageFrame = decodeJPEG2000(imageFrame, pixelData, decodeConfig, options);
      break;
    case '1.2.840.10008.1.2.4.91':
      // JPEG 2000 Lossy
      imageFrame = decodeJPEG2000(imageFrame, pixelData, decodeConfig, options);
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
      case 'Uint16Array':
        TypedArrayConstructor = Uint16Array;
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
        'target array for image does not have the same length as the decoded image length.'
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

  if (options.preScale && options.preScale.scalingParameters) {
    const { scalingParameters } = options.preScale;
    const { rescaleSlope, rescaleIntercept } = scalingParameters;

    if (
      typeof rescaleSlope === 'number' &&
      typeof rescaleIntercept === 'number'
    ) {
      scaleArray(pixelDataArray, scalingParameters);
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
