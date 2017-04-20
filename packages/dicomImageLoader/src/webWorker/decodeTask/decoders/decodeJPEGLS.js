"use strict";

var charLS;

function jpegLSDecode(data, isSigned) {

  // prepare input parameters
  var dataPtr = charLS._malloc(data.length);
  charLS.writeArrayToMemory(data, dataPtr);

  // prepare output parameters
  var imagePtrPtr=charLS._malloc(4);
  var imageSizePtr=charLS._malloc(4);
  var widthPtr=charLS._malloc(4);
  var heightPtr=charLS._malloc(4);
  var bitsPerSamplePtr=charLS._malloc(4);
  var stridePtr=charLS._malloc(4);
  var allowedLossyErrorPtr =charLS._malloc(4);
  var componentsPtr=charLS._malloc(4);
  var interleaveModePtr=charLS._malloc(4);

  // Decode the image
  var result = charLS.ccall(
    'jpegls_decode',
    'number',
    ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
    [dataPtr, data.length, imagePtrPtr, imageSizePtr, widthPtr, heightPtr, bitsPerSamplePtr, stridePtr, componentsPtr, allowedLossyErrorPtr, interleaveModePtr]
  );

  // Extract result values into object
  var image = {
    result : result,
    width : charLS.getValue(widthPtr,'i32'),
    height : charLS.getValue(heightPtr,'i32'),
    bitsPerSample : charLS.getValue(bitsPerSamplePtr,'i32'),
    stride : charLS.getValue(stridePtr,'i32'),
    components : charLS.getValue(componentsPtr, 'i32'),
    allowedLossyError : charLS.getValue(allowedLossyErrorPtr, 'i32'),
    interleaveMode: charLS.getValue(interleaveModePtr, 'i32'),
    pixelData: undefined
  };

  // Copy image from emscripten heap into appropriate array buffer type
  var imagePtr = charLS.getValue(imagePtrPtr, '*');
  if(image.bitsPerSample <= 8) {
    image.pixelData = new Uint8Array(image.width * image.height * image.components);
    image.pixelData.set(new Uint8Array(charLS.HEAP8.buffer, imagePtr, image.pixelData.length));
  } else {
    // I have seen 16 bit signed images, but I don't know if 16 bit unsigned is valid, hoping to get
    // answer here:
    // https://github.com/team-charls/charls/issues/14
    if(isSigned) {
      image.pixelData = new Int16Array(image.width * image.height * image.components);
      image.pixelData.set(new Int16Array(charLS.HEAP16.buffer, imagePtr, image.pixelData.length));
    } else {
      image.pixelData = new Uint16Array(image.width * image.height * image.components);
      image.pixelData.set(new Uint16Array(charLS.HEAP16.buffer, imagePtr, image.pixelData.length));
    }
  }

  // free memory and return image object
  charLS._free(dataPtr);
  charLS._free(imagePtr);
  charLS._free(imagePtrPtr);
  charLS._free(imageSizePtr);
  charLS._free(widthPtr);
  charLS._free(heightPtr);
  charLS._free(bitsPerSamplePtr);
  charLS._free(stridePtr);
  charLS._free(componentsPtr);
  charLS._free(interleaveModePtr);

  return image;
}

function initializeJPEGLS() {
  // check to make sure codec is loaded
  if(typeof CharLS === 'undefined') {
    throw 'No JPEG-LS decoder loaded';
  }

  // Try to initialize CharLS
  // CharLS https://github.com/chafey/charls
  if(!charLS) {
    charLS = CharLS();
    if(!charLS || !charLS._jpegls_decode) {
      throw 'JPEG-LS failed to initialize';
    }
  }

}

function decodeJPEGLS(imageFrame, pixelData)
{
  initializeJPEGLS();

  var image = jpegLSDecode(pixelData, imageFrame.pixelRepresentation === 1);
  //console.log(image);

  // throw error if not success or too much data
  if(image.result !== 0 && image.result !== 6) {
    throw 'JPEG-LS decoder failed to decode frame (error code ' + image.result + ')';
  }

  imageFrame.columns = image.width;
  imageFrame.rows = image.height;
  imageFrame.pixelData = image.pixelData;
  return imageFrame;
}

export default decodeJPEGLS;
export { initializeJPEGLS };
