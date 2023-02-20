import { getOptions } from './internal/options.js';
import decodeJPEGBaseline8BitColor from './decodeJPEGBaseline8BitColor.js';

import { default as decodeImageFrameHandler } from '../shared/decodeImageFrame.js';
import calculateMinMax from '../shared/calculateMinMax.js';

async function processDecodeTask(
  imageFrame,
  transferSyntax,
  pixelData,
  options
) {
  const loaderOptions = getOptions();
  const { strict, decodeConfig } = loaderOptions;

  const decodeArguments = [
    imageFrame,
    transferSyntax,
    pixelData,
    decodeConfig,
    options,
  ];

  const decodedImageFrame = await decodeImageFrameHandler(...decodeArguments);

  calculateMinMax(decodedImageFrame, strict);

  return decodedImageFrame;
}

function decodeImageFrame(
  imageFrame,
  transferSyntax,
  pixelData,
  canvas,
  options = {}
) {
  switch (transferSyntax) {
    case '1.2.840.10008.1.2':
      // Implicit VR Little Endian
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.1':
      // Explicit VR Little Endian
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.2':
      // Explicit VR Big Endian (retired)
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.1.99':
      // Deflate transfer syntax (deflated by dicomParser)
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.5':
      // RLE Lossless
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
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

      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.51':
      // JPEG Baseline lossy process 2 & 4 (12 bit)
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.57':
      // JPEG Lossless, Nonhierarchical (Processes 14)
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.70':
      // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.80':
      // JPEG-LS Lossless Image Compression
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.81':
      // JPEG-LS Lossy (Near-Lossless) Image Compression
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.90':
      // JPEG 2000 Lossless
      return processDecodeTask(imageFrame, transferSyntax, pixelData, options);
    case '1.2.840.10008.1.2.4.91':
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

  return Promise.reject(
    new Error(`No decoder for transfer syntax ${transferSyntax}`)
  );
}

export default decodeImageFrame;
