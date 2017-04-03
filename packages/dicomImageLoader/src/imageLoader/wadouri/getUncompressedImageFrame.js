/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getUncompressedImageFrame(dataSet, frameIndex) {
    var pixelDataElement = dataSet.elements.x7fe00010;
    var bitsAllocated = dataSet.uint16('x00280100');
    var rows = dataSet.uint16('x00280010');
    var columns = dataSet.uint16('x00280011');
    var samplesPerPixel = dataSet.uint16('x00280002');

    var pixelDataOffset = pixelDataElement.dataOffset;
    var pixelsPerFrame = rows * columns * samplesPerPixel;

    var frameOffset;
    if(bitsAllocated === 8) {
      frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      return new Uint8Array(dataSet.byteArray.buffer, frameOffset, pixelsPerFrame);
    }
    else if(bitsAllocated === 16) {
      frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * 2;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      return new Uint8Array(dataSet.byteArray.buffer, frameOffset,pixelsPerFrame * 2);
    } else if (bitsAllocated === 1) {
      frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * 0.125;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      return cornerstoneWADOImageLoader.wadouri.unpackBinaryFrame(dataSet.byteArray, frameOffset, pixelsPerFrame);
    }

    throw 'unsupported pixel format';
  }

  cornerstoneWADOImageLoader.wadouri.getUncompressedImageFrame = getUncompressedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));