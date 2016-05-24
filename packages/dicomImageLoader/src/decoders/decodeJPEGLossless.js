"use strict";
(function (cornerstoneWADOImageLoader) {

  function decodeJPEGLossless(dataSet, frame) {
    var bitsAllocated = dataSet.uint16('x00280100');
    var pixelRepresentation = dataSet.uint16('x00280103');
    var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);
    var byteOutput = bitsAllocated <= 8 ? 1 : 2;
    //console.time('jpeglossless');
    var decoder = new jpeg.lossless.Decoder();
    var decompressedData = decoder.decode(encodedImageFrame.buffer, encodedImageFrame.byteOffset, encodedImageFrame.length, byteOutput);
    //console.timeEnd('jpeglossless');
    if (pixelRepresentation === 0) {
      if (byteOutput === 2) {
        return new Uint16Array(decompressedData.buffer);
      } else {
        // untested!
        return new Uint8Array(decompressedData.buffer);
      }
    } else {
      return new Int16Array(decompressedData.buffer);
    }
  }
  // module exports
  cornerstoneWADOImageLoader.decodeJPEGLossless = decodeJPEGLossless;

}(cornerstoneWADOImageLoader));