import webWorkerManager from './webWorkerManager.js';
import decodeJPEGBaseline8BitColor from './decodeJPEGBaseline8BitColor.js';

// dicomParser requires pako for browser-side decoding of deflate transfer syntax
// We only need one function though, so lets import that so we don't make our bundle
// too large.
import { inflateRaw } from 'pako/lib/inflate.js';

window.pako = { inflateRaw };

function processDecodeTask(
  imageFrame,
  transferSyntax,
  pixelData,
  options,
  decodeConfig
) {
  const priority = options.priority || undefined;
  const transferList = options.transferPixelData
    ? [pixelData.buffer]
    : undefined;

  return webWorkerManager.addTask(
    'decodeTask',
    {
      imageFrame,
      transferSyntax,
      pixelData,
      options,
      decodeConfig,
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
  options = {},
  decodeConfig
) {
  switch (transferSyntax) {
    case '1.2.840.10008.1.2':
      // Implicit VR Little Endian
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.1':
      // Explicit VR Little Endian
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.2':
      // Explicit VR Big Endian (retired)
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.1.99':
      // Deflate transfer syntax (deflated by dicomParser)
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.5':
      // RLE Lossless
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.50':
      // JPEG Baseline lossy process 1 (8 bit)

      // Handle 8-bit JPEG Baseline color images using the browser's built-in
      // JPEG decoding
      if (
        imageFrame.bitsAllocated === 8 &&
        (imageFrame.samplesPerPixel === 3 || imageFrame.samplesPerPixel === 4)
      ) {
        return decodeJPEGBaseline8BitColor(imageFrame, pixelData, canvas);
      }

      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.51':
      // JPEG Baseline lossy process 2 & 4 (12 bit)
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.57':
      // JPEG Lossless, Nonhierarchical (Processes 14)
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.70':
      // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.80':
      // JPEG-LS Lossless Image Compression
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.81':
      // JPEG-LS Lossy (Near-Lossless) Image Compression
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.90':
      // JPEG 2000 Lossless
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
    case '1.2.840.10008.1.2.4.91':
      // JPEG 2000 Lossy
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );

    case '3.2.840.10008.1.2.4.96':
      // HTJ2K
      return processDecodeTask(
        imageFrame,
        transferSyntax,
        pixelData,
        options,
        decodeConfig
      );
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

  return Promise.reject(
    new Error(`No decoder for transfer syntax ${transferSyntax}`)
  );
}

export default decodeImageFrame;
