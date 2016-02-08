(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function swap16(val) {
    return ((val & 0xFF) << 8)
      | ((val >> 8) & 0xFF);
  }


  function extractUncompressedPixels(dataSet, frame, bigEndian)
  {
    var pixelFormat = cornerstoneWADOImageLoader.getPixelFormat(dataSet);
    var imageFrame = getImageFrame(dataSet, frame, pixelFormat);
    // byte swap 16 bit data if bigEndian
    if(bigEndian && (pixelFormat === 2 || pixelFormat === 3)) {
      for(var i=0; i < imageFrame.length; i++) {
        imageFrame[i] = swap16(imageFrame[i]);
      }
    }
    return imageFrame;
  }

  function getImageFrame(dataSet, frame, pixelFormat) {
    // Note - we may want to sanity check the rows * columns * bitsAllocated * samplesPerPixel against the buffer size
    var pixelDataElement = dataSet.elements.x7fe00010;
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var samplesPerPixel = dataSet.uint16('x00280002');
    var pixelDataOffset = pixelDataElement.dataOffset;
    var numPixels = width * height * samplesPerPixel;
    if (!numPixels) {
      throw "Sanity check failed when calculating the number of pixels";
    }
    var frameOffset = 0;
    if(pixelFormat === 1) {
      frameOffset = pixelDataOffset + frame * numPixels;
      return new Uint8Array(dataSet.byteArray.buffer, frameOffset, numPixels);
    }
    else if(pixelFormat === 2) {
      frameOffset = pixelDataOffset + frame * numPixels * 2;
      return new Uint16Array(dataSet.byteArray.buffer, frameOffset, numPixels);
      return imageFrame;
    }
    else if(pixelFormat === 3) {
      frameOffset = pixelDataOffset + frame * numPixels * 2;
      return new Int16Array(dataSet.byteArray.buffer, frameOffset, numPixels);
    }
    throw "Unknown pixel format";
  }

  cornerstoneWADOImageLoader.extractUncompressedPixels = extractUncompressedPixels;
}($, cornerstone, cornerstoneWADOImageLoader));