import CharLS from '../../../codecs/charLS-FixedMemory-browser.js';

let charLS;

function jpegLSDecode(data, isSigned) {
  // prepare input parameters
  const dataPtr = charLS._malloc(data.length);

  charLS.writeArrayToMemory(data, dataPtr);

  // prepare output parameters
  const imagePtrPtr = charLS._malloc(4);
  const imageSizePtr = charLS._malloc(4);
  const widthPtr = charLS._malloc(4);
  const heightPtr = charLS._malloc(4);
  const bitsPerSamplePtr = charLS._malloc(4);
  const stridePtr = charLS._malloc(4);
  const allowedLossyErrorPtr = charLS._malloc(4);
  const componentsPtr = charLS._malloc(4);
  const interleaveModePtr = charLS._malloc(4);

  // Decode the image
  const result = charLS.ccall(
    'jpegls_decode',
    'number',
    [
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
    ],
    [
      dataPtr,
      data.length,
      imagePtrPtr,
      imageSizePtr,
      widthPtr,
      heightPtr,
      bitsPerSamplePtr,
      stridePtr,
      componentsPtr,
      allowedLossyErrorPtr,
      interleaveModePtr,
    ]
  );

  // Extract result values into object
  const image = {
    result,
    width: charLS.getValue(widthPtr, 'i32'),
    height: charLS.getValue(heightPtr, 'i32'),
    bitsPerSample: charLS.getValue(bitsPerSamplePtr, 'i32'),
    stride: charLS.getValue(stridePtr, 'i32'),
    components: charLS.getValue(componentsPtr, 'i32'),
    allowedLossyError: charLS.getValue(allowedLossyErrorPtr, 'i32'),
    interleaveMode: charLS.getValue(interleaveModePtr, 'i32'),
    pixelData: undefined,
  };

  // Copy image from emscripten heap into appropriate array buffer type
  const imagePtr = charLS.getValue(imagePtrPtr, '*');

  if (image.bitsPerSample <= 8) {
    image.pixelData = new Uint8Array(
      image.width * image.height * image.components
    );
    image.pixelData.set(
      new Uint8Array(charLS.HEAP8.buffer, imagePtr, image.pixelData.length)
    );
  } else if (isSigned) {
    image.pixelData = new Int16Array(
      image.width * image.height * image.components
    );
    image.pixelData.set(
      new Int16Array(charLS.HEAP16.buffer, imagePtr, image.pixelData.length)
    );
  } else {
    image.pixelData = new Uint16Array(
      image.width * image.height * image.components
    );
    image.pixelData.set(
      new Uint16Array(charLS.HEAP16.buffer, imagePtr, image.pixelData.length)
    );
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
  if (typeof CharLS === 'undefined') {
    throw new Error('No JPEG-LS decoder loaded');
  }

  // Try to initialize CharLS
  // CharLS https://github.com/cornerstonejs/charls
  if (!charLS) {
    charLS = CharLS();
    if (!charLS || !charLS._jpegls_decode) {
      throw new Error('JPEG-LS failed to initialize');
    }
  }
}

function decodeJPEGLS(imageFrame, pixelData) {
  initializeJPEGLS();

  const image = jpegLSDecode(pixelData, imageFrame.pixelRepresentation === 1);

  // throw error if not success or too much data
  if (image.result !== 0 && image.result !== 6) {
    throw new Error(
      `JPEG-LS decoder failed to decode frame (error code ${image.result})`
    );
  }

  imageFrame.columns = image.width;
  imageFrame.rows = image.height;
  imageFrame.pixelData = image.pixelData;

  return imageFrame;
}

export default decodeJPEGLS;
export { initializeJPEGLS };
