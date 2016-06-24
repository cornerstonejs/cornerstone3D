/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getUncompressedImageFrame(dataSet, imageFrame, pixelDataElement, frameIndex) {

    var pixelDataOffset = pixelDataElement.dataOffset;
    var frameSize = imageFrame.rows * imageFrame.columns * imageFrame.samplesPerPixel;

    if(imageFrame.bitsAllocated === 8) {
      var frameOffset = pixelDataOffset + frameIndex * frameSize;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      imageFrame.pixelData = new Uint8Array(dataSet.byteArray.buffer, frameOffset, frameSize);
      return imageFrame;
    }
    else if(imageFrame.bitsAllocated === 16) {
      var frameOffset = pixelDataOffset + frameIndex * frameSize * 2;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      if(imageFrame.pixelRepresentation === 0) {
        imageFrame.pixelData = new Uint16Array(dataSet.byteArray.buffer, frameOffset, frameSize);
        return imageFrame;
      } else {
        imageFrame.pixelData = new Int16Array(dataSet.byteArray.buffer, frameOffset, frameSize);
        return imageFrame;
      }
    }

    throw 'unsupported pixel format';
  }

  cornerstoneWADOImageLoader.getUncompressedImageFrame = getUncompressedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));