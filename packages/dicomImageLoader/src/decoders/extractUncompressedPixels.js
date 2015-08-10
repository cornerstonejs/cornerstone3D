(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  function extractUncompressedPixels(dataSet, frame)
  {
    var pixelFormat = cornerstoneWADOImageLoader.getPixelFormat(dataSet);
    var pixelDataElement = dataSet.elements.x7fe00010;
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var samplesPerPixel = dataSet.uint16('x00280002');
    var pixelDataOffset = pixelDataElement.dataOffset;
    var numPixels = width * height * samplesPerPixel;
    // Note - we may want to sanity check the rows * columns * bitsAllocated * samplesPerPixel against the buffer size

    var frameOffset = 0;
    if(pixelFormat === 1) {
      frameOffset = pixelDataOffset + frame * numPixels;
      return new Uint8Array(dataSet.byteArray.buffer, frameOffset, numPixels);
    }
    else if(pixelFormat === 2) {
      frameOffset = pixelDataOffset + frame * numPixels * 2;
      return new Uint16Array(dataSet.byteArray.buffer, frameOffset, numPixels);
    }
    else if(pixelFormat === 3) {
      frameOffset = pixelDataOffset + frame * numPixels * 2;
      return new Int16Array(dataSet.byteArray.buffer, frameOffset, numPixels);
    }
  }

  cornerstoneWADOImageLoader.extractUncompressedPixels = extractUncompressedPixels;
}($, cornerstone, cornerstoneWADOImageLoader));