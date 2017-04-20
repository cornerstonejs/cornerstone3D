import decodeLittleEndian from './decoders/decodeLittleEndian';
import decodeBigEndian from './decoders/decodeBigEndian';
import decodeRLE from './decoders/decodeRLE';
import decodeJPEGBaseline from './decoders/decodeJPEGBaseline';
import decodeJPEGLossless from './decoders/decodeJPEGLossless';
import decodeJPEGLS from './decoders/decodeJPEGLS';
import decodeJPEG2000 from './decoders/decodeJPEG2000';

"use strict";

function decodeImageFrame(imageFrame, transferSyntax, pixelData, decodeConfig, options) {
  var start = new Date().getTime();

  // Implicit VR Little Endian
  if(transferSyntax === "1.2.840.10008.1.2") {
    imageFrame = decodeLittleEndian(imageFrame, pixelData);
  }
  // Explicit VR Little Endian
  else if(transferSyntax === "1.2.840.10008.1.2.1") {
    imageFrame = decodeLittleEndian(imageFrame, pixelData);
  }
  // Explicit VR Big Endian (retired)
  else if (transferSyntax === "1.2.840.10008.1.2.2" ) {
    imageFrame = decodeBigEndian(imageFrame, pixelData);
  }
  // Deflate transfer syntax (deflated by dicomParser)
  else if(transferSyntax === '1.2.840.10008.1.2.1.99') {
    imageFrame = decodeLittleEndian(imageFrame, pixelData);
  }
  // RLE Lossless
  else if (transferSyntax === "1.2.840.10008.1.2.5" )
  {
    imageFrame = decodeRLE(imageFrame, pixelData);
  }
  // JPEG Baseline lossy process 1 (8 bit)
  else if (transferSyntax === "1.2.840.10008.1.2.4.50")
  {
    imageFrame = decodeJPEGBaseline(imageFrame, pixelData);
  }
  // JPEG Baseline lossy process 2 & 4 (12 bit)
  else if (transferSyntax === "1.2.840.10008.1.2.4.51")
  {
    imageFrame = decodeJPEGBaseline(imageFrame, pixelData);
  }
  // JPEG Lossless, Nonhierarchical (Processes 14)
  else if (transferSyntax === "1.2.840.10008.1.2.4.57")
  {
    imageFrame = decodeJPEGLossless(imageFrame, pixelData);
  }
  // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
  else if (transferSyntax === "1.2.840.10008.1.2.4.70" )
  {
    imageFrame = decodeJPEGLossless(imageFrame, pixelData);
  }
  // JPEG-LS Lossless Image Compression
  else if (transferSyntax === "1.2.840.10008.1.2.4.80" )
  {
    imageFrame = decodeJPEGLS(imageFrame, pixelData);
  }
  // JPEG-LS Lossy (Near-Lossless) Image Compression
  else if (transferSyntax === "1.2.840.10008.1.2.4.81" )
  {
    imageFrame = decodeJPEGLS(imageFrame, pixelData);
  }
  // JPEG 2000 Lossless
  else if (transferSyntax === "1.2.840.10008.1.2.4.90")
  {
    imageFrame = decodeJPEG2000(imageFrame, pixelData, decodeConfig, options);
  }
  // JPEG 2000 Lossy
  else if (transferSyntax === "1.2.840.10008.1.2.4.91")
  {
    imageFrame = decodeJPEG2000(imageFrame, pixelData, decodeConfig, options);
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
  else
  {
    if(console && console.log) {
      console.log("Image cannot be decoded due to Unsupported transfer syntax " + transferSyntax);
    }
    throw "no decoder for transfer syntax " + transferSyntax;
  }

  var end = new Date().getTime();
  imageFrame.decodeTimeInMS = end - start;

  return imageFrame;
}

export default decodeImageFrame;
