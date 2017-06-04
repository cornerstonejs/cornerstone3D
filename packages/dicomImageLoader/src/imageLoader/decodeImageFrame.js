import webWorkerManager from './webWorkerManager';
import decodeJPEGBaseline8BitColor from './decodeJPEGBaseline8BitColor';

function addDecodeTask (imageFrame, transferSyntax, pixelData, options) {
  const priority = options.priority || undefined;
  const transferList = options.transferPixelData ? [pixelData.buffer] : undefined;

  return webWorkerManager.addTask(
    'decodeTask',
    {
      imageFrame,
      transferSyntax,
      pixelData,
      options
    }, priority, transferList).promise;
}

function decodeImageFrame (imageFrame, transferSyntax, pixelData, canvas, options) {
  options = options || {};

  // TODO: Turn this into a switch statement instead
  if (transferSyntax === '1.2.840.10008.1.2') {
    // Implicit VR Little Endian
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.1') {
    // Explicit VR Little Endian
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.2') {
    // Explicit VR Big Endian (retired)
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.1.99') {
    // Deflate transfer syntax (deflated by dicomParser)
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.5') {
    // RLE Lossless
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.50') {
    // JPEG Baseline lossy process 1 (8 bit)

    // Handle 8-bit JPEG Baseline color images using the browser's built-in
    // JPEG decoding
    if (imageFrame.bitsAllocated === 8 &&
       (imageFrame.samplesPerPixel === 3 || imageFrame.samplesPerPixel === 4)) {
      return decodeJPEGBaseline8BitColor(imageFrame, pixelData, canvas);
    }

    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.51') {
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.57') {
    // JPEG Lossless, Nonhierarchical (Processes 14)
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.70') {
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.80') {
    // JPEG-LS Lossless Image Compression
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.81') {
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.90') {
    // JPEG 2000 Lossless
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.91') {
    // JPEG 2000 Lossy
    return addDecodeTask(imageFrame, transferSyntax, pixelData, options);
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

  throw new Error(`No decoder for transfer syntax ${transferSyntax}`);
}

export default decodeImageFrame;
