/* eslint-disable complexity */
import { ByteArray } from 'dicom-parser';
import bilinear from './scaling/bilinear';
import replicate from './scaling/replicate';
import decodeLittleEndian from './decoders/decodeLittleEndian';
import decodeBigEndian from './decoders/decodeBigEndian';
import decodeRLE from './decoders/decodeRLE';
import decodeJPEGBaseline8Bit from './decoders/decodeJPEGBaseline8Bit';
// import decodeJPEGBaseline12Bit from './decoders/decodeJPEGBaseline12Bit';
import decodeJPEGBaseline12Bit from './decoders/decodeJPEGBaseline12Bit-js';
import decodeJPEGLossless from './decoders/decodeJPEGLossless';
import decodeJPEGLS from './decoders/decodeJPEGLS';
import decodeJPEG2000 from './decoders/decodeJPEG2000';
import decodeHTJ2K from './decoders/decodeHTJ2K';
// Note that the scaling is pixel value scaling, which is applying a modality LUT
import applyModalityLUT from './scaling/scaleArray';
import { ImageFrame, LoaderDecodeOptions, PixelDataTypedArray } from '../types';
import getMinMax from './getMinMax';
import getPixelDataTypeFromMinMax from './getPixelDataTypeFromMinMax';
import isColorImage from './isColorImage';

const imageUtils = {
  bilinear,
  replicate,
};

/**
 * Decodes the provided image frame.
 * This is an async function return the result, or you can provide an optional
 * callbackFn that is called with the results.
 */
async function decodeImageFrame(
  imageFrame: ImageFrame,
  transferSyntax: string,
  pixelData: ByteArray,
  decodeConfig: LoaderDecodeOptions,
  options,
  callbackFn?: (...args: any[]) => void
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
        signed: imageFrame.pixelRepresentation === 1, // imageFrame.signed,
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
    case '1.2.840.10008.1.2.4.201':
    case '1.2.840.10008.1.2.4.202':
    case '1.2.840.10008.1.2.4.203':
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

function postProcessDecodedPixels(
  imageFrame: ImageFrame,
  options,
  start: number,
  decodeConfig: LoaderDecodeOptions
) {
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
  const { min: minBeforeScale, max: maxBeforeScale } = getMinMax(
    imageFrame.pixelData
  );

  const typedArrayConstructors = {
    Uint8Array,
    Uint16Array: use16BitDataType ? Uint16Array : undefined,
    Int16Array: use16BitDataType ? Int16Array : undefined,
    Float32Array,
  };

  const type = options.targetBuffer?.type;

  const canRenderFloat =
    typeof options.allowFloatRendering !== 'undefined'
      ? options.allowFloatRendering
      : true;

  // Sometimes the type is specified before the DICOM header data has been
  // read.  This is fine except for color data, where the wrong type gets
  // specified.  Don't use the target buffer in that case.
  const invalidType =
    isColorImage(imageFrame.photometricInterpretation) &&
    options.targetBuffer?.offset === undefined;

  const willScale = options.preScale?.enabled;

  const hasFloatRescale =
    willScale &&
    Object.values(options.preScale.scalingParameters).some(
      (v) => typeof v === 'number' && !Number.isInteger(v)
    );
  const disableScale =
    !options.preScale.enabled || (!canRenderFloat && hasFloatRescale);

  if (type && !invalidType) {
    pixelDataArray = _handleTargetBuffer(
      options,
      imageFrame,
      typedArrayConstructors,
      pixelDataArray
    );
  } else if (options.preScale.enabled && !disableScale) {
    pixelDataArray = _handlePreScaleSetup(
      options,
      minBeforeScale,
      maxBeforeScale,
      imageFrame
    );
  } else {
    pixelDataArray = _getDefaultPixelDataArray(
      minBeforeScale,
      maxBeforeScale,
      imageFrame
    );
  }

  let minAfterScale = minBeforeScale;
  let maxAfterScale = maxBeforeScale;

  if (options.preScale.enabled && !disableScale) {
    const scalingParameters = options.preScale.scalingParameters;
    _validateScalingParameters(scalingParameters);

    const { rescaleSlope, rescaleIntercept } = scalingParameters;
    const isSlopeAndInterceptNumbers =
      typeof rescaleSlope === 'number' && typeof rescaleIntercept === 'number';

    if (isSlopeAndInterceptNumbers) {
      applyModalityLUT(pixelDataArray, scalingParameters);
      imageFrame.preScale = {
        ...options.preScale,
        scaled: true,
      };

      // calculate the min and max after scaling
      const { rescaleIntercept, rescaleSlope, suvbw } = scalingParameters;
      minAfterScale = rescaleSlope * minBeforeScale + rescaleIntercept;
      maxAfterScale = rescaleSlope * maxBeforeScale + rescaleIntercept;

      if (suvbw) {
        minAfterScale = minAfterScale * suvbw;
        maxAfterScale = maxAfterScale * suvbw;
      }
    }
  } else if (disableScale) {
    imageFrame.preScale = {
      scaled: false,
    };

    minAfterScale = minBeforeScale;
    maxAfterScale = maxBeforeScale;
  }

  // assign the array buffer to the pixelData only if it is not a SharedArrayBuffer
  // since we can't transfer ownership of a SharedArrayBuffer to another thread
  // in the workers
  const hasTargetBuffer = options.targetBuffer !== undefined;

  if (!hasTargetBuffer || !options.isSharedArrayBuffer) {
    imageFrame.pixelData = pixelDataArray;
  }

  imageFrame.minAfterScale = minAfterScale;
  imageFrame.maxAfterScale = maxAfterScale;

  const end = new Date().getTime();
  imageFrame.decodeTimeInMS = end - start;

  return imageFrame;
}

function _handleTargetBuffer(
  options: any,
  imageFrame: ImageFrame,
  typedArrayConstructors: {
    Uint8Array: Uint8ArrayConstructor;
    Uint16Array: Uint16ArrayConstructor;
    Int16Array: Int16ArrayConstructor;
    Float32Array: Float32ArrayConstructor;
  },
  pixelDataArray: PixelDataTypedArray
) {
  const {
    arrayBuffer,
    type,
    offset: rawOffset = 0,
    length: rawLength,
    rows,
  } = options.targetBuffer;

  const TypedArrayConstructor = typedArrayConstructors[type];

  if (!TypedArrayConstructor) {
    throw new Error(
      `target array ${type} is not supported, you need to set use16BitDataType to true if you want to use Uint16Array or Int16Array.`
    );
  }

  if (rows && rows != imageFrame.rows) {
    scaleImageFrame(imageFrame, options.targetBuffer, TypedArrayConstructor);
  }
  const imageFrameLength = imageFrame.pixelDataLength;

  const offset = rawOffset;
  const length =
    rawLength !== null && rawLength !== undefined
      ? rawLength
      : imageFrameLength - offset;

  const imageFramePixelData = imageFrame.pixelData;

  if (length !== imageFramePixelData.length) {
    throw new Error(
      `target array for image does not have the same length (${length}) as the decoded image length (${imageFramePixelData.length}).`
    );
  }

  // TypedArray.Set is api level and ~50x faster than copying elements even for
  // Arrays of different types, which aren't simply memcpy ops.
  const typedArray = arrayBuffer
    ? new TypedArrayConstructor(arrayBuffer, offset, length)
    : new TypedArrayConstructor(length);

  typedArray.set(imageFramePixelData, 0);

  // If need to scale, need to scale correct array.
  pixelDataArray = typedArray;
  return pixelDataArray;
}

function _handlePreScaleSetup(
  options,
  minBeforeScale,
  maxBeforeScale,
  imageFrame
) {
  const scalingParameters = options.preScale.scalingParameters;
  _validateScalingParameters(scalingParameters);

  const { rescaleSlope, rescaleIntercept } = scalingParameters;
  const areSlopeAndInterceptNumbers =
    typeof rescaleSlope === 'number' && typeof rescaleIntercept === 'number';

  let scaledMin = minBeforeScale;
  let scaledMax = maxBeforeScale;

  if (areSlopeAndInterceptNumbers) {
    scaledMin = rescaleSlope * minBeforeScale + rescaleIntercept;
    scaledMax = rescaleSlope * maxBeforeScale + rescaleIntercept;
  }

  return _getDefaultPixelDataArray(scaledMin, scaledMax, imageFrame);
}

function _getDefaultPixelDataArray(min, max, imageFrame) {
  const TypedArrayConstructor = getPixelDataTypeFromMinMax(min, max);
  const typedArray = new TypedArrayConstructor(imageFrame.pixelData.length);
  typedArray.set(imageFrame.pixelData, 0);

  return typedArray;
}

function _validateScalingParameters(scalingParameters) {
  if (!scalingParameters) {
    throw new Error(
      'options.preScale.scalingParameters must be defined if preScale.enabled is true, and scalingParameters cannot be derived from the metadata providers.'
    );
  }
}

function createDestinationImage(
  imageFrame,
  targetBuffer,
  TypedArrayConstructor
) {
  const { samplesPerPixel } = imageFrame;
  const { rows, columns } = targetBuffer;
  const typedLength = rows * columns * samplesPerPixel;
  const pixelData = new TypedArrayConstructor(typedLength);
  const bytesPerPixel = pixelData.byteLength / typedLength;
  return {
    pixelData,
    rows,
    columns,
    frameInfo: {
      ...imageFrame.frameInfo,
      rows,
      columns,
    },
    imageInfo: {
      ...imageFrame.imageInfo,
      rows,
      columns,
      bytesPerPixel,
    },
  };
}

/** Scales the image frame, updating the frame in place with a new scaled
 * version of it (in place modification)
 */
function scaleImageFrame(imageFrame, targetBuffer, TypedArrayConstructor) {
  const dest = createDestinationImage(
    imageFrame,
    targetBuffer,
    TypedArrayConstructor
  );
  const { scalingType = 'replicate' } = targetBuffer;
  imageUtils[scalingType](imageFrame, dest);
  Object.assign(imageFrame, dest);
  return imageFrame;
}

export default decodeImageFrame;
