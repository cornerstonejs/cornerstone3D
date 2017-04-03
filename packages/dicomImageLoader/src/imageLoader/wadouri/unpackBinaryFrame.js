/**
 * Function to deal with unpacking a binary frame
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function isBitSet(byte, bitPos) {
    return byte & (1 << bitPos);
  }

  function unpackBinaryFrame(byteArray, frameOffset, pixelsPerFrame) {
    // Create a new pixel array given the image size
    var pixelData = new Uint8Array(pixelsPerFrame);

    for (var i = 0; i < pixelsPerFrame; i++) {
      // Compute byte position
      var bytePos = Math.floor(i / 8);
      
      // Get the current byte
      var byte = byteArray[bytePos + frameOffset];

      // Bit position (0-7) within byte
      var bitPos = (i % 8);

      // Check whether bit at bitpos is set
      pixelData[i] = isBitSet(byte, bitPos) ? 1 : 0;
    }

    return pixelData;
  }

  cornerstoneWADOImageLoader.wadouri.unpackBinaryFrame = unpackBinaryFrame;
}($, cornerstone, cornerstoneWADOImageLoader));