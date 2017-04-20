"use strict";

function decodeJPEGLossless(imageFrame, pixelData) {
  // check to make sure codec is loaded
  if(typeof jpeg === 'undefined' ||
    typeof jpeg.lossless === 'undefined' ||
    typeof jpeg.lossless.Decoder === 'undefined') {
    throw 'No JPEG Lossless decoder loaded';
  }

  var byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  //console.time('jpeglossless');
  var buffer = pixelData.buffer;
  var decoder = new jpeg.lossless.Decoder();
  var decompressedData = decoder.decode(buffer, pixelData.byteOffset, pixelData.length, byteOutput);
  //console.timeEnd('jpeglossless');
  if (imageFrame.pixelRepresentation === 0) {
    if (imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = new Uint16Array(decompressedData.buffer);
      return imageFrame;
    } else {
      // untested!
      imageFrame.pixelData = new Uint8Array(decompressedData.buffer);
      return imageFrame;
    }
  } else {
    imageFrame.pixelData = new Int16Array(decompressedData.buffer);
    return imageFrame;
  }
}

export default decodeJPEGLossless;
