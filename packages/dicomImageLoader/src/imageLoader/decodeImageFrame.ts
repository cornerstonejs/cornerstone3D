import decodeJPEGBaseline8BitColor from './decodeJPEGBaseline8BitColor';

// dicomParser requires pako for browser-side decoding of deflate transfer syntax
// We only need one function though, so lets import that so we don't make our bundle
// too large.
import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import external from '../externalModules';
import type { LoaderDecodeOptions } from '../types';

function processDecodeTask(
  imageFrame: Types.IImageFrame,
  transferSyntax: string,
  pixelData: ByteArray,
  srcOptions,
  decodeConfig: LoaderDecodeOptions
): Promise<Types.IImageFrame> {
  const options = { ...srcOptions };
  // If a loader is specified, it can't be passed through because it is a function
  // and can't be safely cloned/copied externally.
  delete options.loader;
  // Similarly, the streamData may contain larger data information and
  // although it can be passed to the decoder, it isn't needed and is slow
  delete options.streamingData;

  const webWorkerManager = external.cornerstone.getWebWorkerManager();
  const priority = options.priority || undefined;
  const transferList = options.transferPixelData
    ? [pixelData.buffer]
    : undefined;

  return webWorkerManager.executeTask(
    'dicomImageLoader',
    'decodeTask',
    {
      imageFrame,
      transferSyntax,
      pixelData,
      options,
      decodeConfig,
    },
    {
      priority,
      requestType: options?.requestType,
    }
  );
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
    case '1.2.840.10008.1.2.4.201':
    case '1.2.840.10008.1.2.4.202':
    case '1.2.840.10008.1.2.4.203':
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
   return cornerstoneDICOMImageLoader.decodeJPEG2000(dataSet, frame);
   }
   // JPEG 2000 Part 2 Multicomponent Image Compression
   else if(transferSyntax === "1.2.840.10008.1.2.4.93")
   {
   return cornerstoneDICOMImageLoader.decodeJPEG2000(dataSet, frame);
   }
   */

  return Promise.reject(
    new Error(`No decoder for transfer syntax ${transferSyntax}`)
  );
}

export default decodeImageFrame;
