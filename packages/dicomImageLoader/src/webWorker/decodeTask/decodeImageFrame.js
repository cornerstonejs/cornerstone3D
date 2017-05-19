import decodeLittleEndian from './decoders/decodeLittleEndian';
import decodeBigEndian from './decoders/decodeBigEndian';
import decodeRLE from './decoders/decodeRLE';
import decodeJPEGBaseline from './decoders/decodeJPEGBaseline';
import decodeJPEGLossless from './decoders/decodeJPEGLossless';
import decodeJPEGLS from './decoders/decodeJPEGLS';
import decodeJPEG2000 from './decoders/decodeJPEG2000';

function decodeImageFrame (imageFrame, transferSyntax, pixelData, decodeConfig, options) {
  const start = new Date().getTime();

  if (transferSyntax === '1.2.840.10008.1.2') {
    // Implicit VR Little Endian
    imageFrame = decodeLittleEndian(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.1') {
    // Explicit VR Little Endian
    imageFrame = decodeLittleEndian(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.2') {
    // Explicit VR Big Endian (retired)
    imageFrame = decodeBigEndian(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.1.99') {
    // Deflate transfer syntax (deflated by dicomParser)
    imageFrame = decodeLittleEndian(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.5') {
    // RLE Lossless
    imageFrame = decodeRLE(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.50') {
    // JPEG Baseline lossy process 1 (8 bit)
    imageFrame = decodeJPEGBaseline(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.51') {
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    imageFrame = decodeJPEGBaseline(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.57') {
    // JPEG Lossless, Nonhierarchical (Processes 14)
    imageFrame = decodeJPEGLossless(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.70') {
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    imageFrame = decodeJPEGLossless(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.80') {
    // JPEG-LS Lossless Image Compression
    imageFrame = decodeJPEGLS(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.81') {
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    imageFrame = decodeJPEGLS(imageFrame, pixelData);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.90') {
    // JPEG 2000 Lossless
    imageFrame = decodeJPEG2000(imageFrame, pixelData, decodeConfig, options);
  } else if (transferSyntax === '1.2.840.10008.1.2.4.91') {
    // JPEG 2000 Lossy
    imageFrame = decodeJPEG2000(imageFrame, pixelData, decodeConfig, options);
  } else {
    if (console && console.log) {
      console.log(`Image cannot be decoded due to Unsupported transfer syntax ${transferSyntax}`);
    }

    throw `no decoder for transfer syntax ${transferSyntax}`;
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

  const end = new Date().getTime();

  imageFrame.decodeTimeInMS = end - start;

  return imageFrame;
}

export default decodeImageFrame;
