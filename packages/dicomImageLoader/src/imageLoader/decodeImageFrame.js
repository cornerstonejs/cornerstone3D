import { getOptions } from './internal/options.js';
import webWorkerManager from './webWorkerManager.js';
import decodeJPEGBaseline8BitColor from './decodeJPEGBaseline8BitColor.js';

// TODO: Find a way to allow useWebWorkers: false that doesn't make the main bundle huge
import { default as decodeImageFrameHandler } from '../shared/decodeImageFrame.js';
import calculateMinMax from '../shared/calculateMinMax.js';
import { initializeJPEG2000 } from '../shared/decoders/decodeJPEG2000.js';
import { initializeJPEGLS } from '../shared/decoders/decodeJPEGLS.js';

let codecsInitialized = false;

function processDecodeTask(imageFrame, transferSyntax, pixelData, options) {
  const priority = options.priority || undefined;
  const transferList = options.transferPixelData
    ? [pixelData.buffer]
    : undefined;
  const loaderOptions = getOptions();
  const { strict, decodeConfig, useWebWorkers } = loaderOptions;

  if (useWebWorkers === false) {
    if (codecsInitialized === false) {
      initializeJPEG2000(decodeConfig);
      initializeJPEGLS(decodeConfig);

      codecsInitialized = true;
    }

    return new Promise((resolve, reject) => {
      try {
        const decodeArguments = [
          imageFrame,
          transferSyntax,
          pixelData,
          decodeConfig,
          options,
        ];
        const decodedImageFrame = decodeImageFrameHandler(...decodeArguments);

        calculateMinMax(decodedImageFrame, strict);

        resolve(decodedImageFrame);
      } catch (error) {
        reject(error);
      }
    });
  }

  return webWorkerManager.addTask(
    'decodeTask',
    {
      imageFrame,
      transferSyntax,
      pixelData,
      options,
    },
    priority,
    transferList
  ).promise;
}

function decodeImageFrame(
  imageFrame,
  transferSyntax,
  pixelData,
  canvas,
  options = {}
) {
  // TODO: Turn this into a switch statement instead
  if (transferSyntax === '1.2.840.10008.1.2') {
    // Implicit VR Little Endian
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.1') {
    // Explicit VR Little Endian
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.2') {
    // Explicit VR Big Endian (retired)
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.1.99') {
    // Deflate transfer syntax (deflated by dicomParser)
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.5') {
    // RLE Lossless
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.50') {
    // JPEG Baseline lossy process 1 (8 bit)

    // Handle 8-bit JPEG Baseline color images using the browser's built-in
    // JPEG decoding
    if (
      imageFrame.bitsAllocated === 8 &&
      (imageFrame.samplesPerPixel === 3 || imageFrame.samplesPerPixel === 4)
    ) {
      return decodeJPEGBaseline8BitColor(imageFrame, pixelData, canvas);
    }

    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.51') {
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.57') {
    // JPEG Lossless, Nonhierarchical (Processes 14)
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.70') {
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.80') {
    // JPEG-LS Lossless Image Compression
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.81') {
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.90') {
    // JPEG 2000 Lossless
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.91') {
    // JPEG 2000 Lossy
    return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
  }

  /* Don't know if these work...
   // JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)
   else if(transferSyntax === "1.2.840.10008.1.2.4.92")
   {
   return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
   }
   // JPEG 2000 Part 2 Multicomponent Image Compression
   else if(transferSyntax === "1.2.840.10008.1.2.4.93")
   {
   return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
   }
   */

  return new Promise((resolve, reject) => {
    reject(new Error(`No decoder for transfer syntax ${transferSyntax}`));
  });
}

export default decodeImageFrame;
