"use strict";
(function (cornerstoneWADOImageLoader) {


  var charLS;

  function jpegLSDecode(data) {

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

    // If error, free memory and return error code
    if(result !== 0) {
      charLS._free(dataPtr);
      charLS._free(imagePtrPtr);
      charLS._free(imageSizePtr);
      charLS._free(widthPtr);
      charLS._free(heightPtr);
      charLS._free(bitsPerSamplePtr);
      charLS._free(stridePtr);
      charLS._free(componentsPtr);
      charLS._free(interleaveModePtr);
      return {
        result : result
      };
    }

    // No error, extract result values into object
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

    // No error = copy image from emscripten heap into appropriate array buffer type
    var imagePtr = charLS.getValue(imagePtrPtr, '*');
    if(image.bitsPerSample <= 8) {
      image.pixelData = new Uint8Array(image.width * image.height * image.components);
    } else {
      // I have seen 16 bit signed images, but I don't know if 16 bit unsigned is valid, hoping to get
      // answer here:
      // https://github.com/team-charls/charls/issues/14
      image.pixelData = new Int16Array(image.width * image.height * image.components);
    }
    var pixelData = image.pixelData;
    var offset = 0;
    for(var y=0; y < image.height; y++) {
      var firstPixel = imagePtr + image.stride * y;
      for(var x=0; x < image.width; x++) {
        for(var c=0; c < image.components; c++) {
          if(image.bitsPerSample <= 8) {
            pixelData[offset++] = charLS.getValue(firstPixel++, 'i8');
          } else {
            pixelData[offset++] = charLS.getValue(firstPixel, 'i16');
            firstPixel += 2;
          }
        }
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

  function decodeJPEGLS(dataSet, frame)
  {
    // Try to initialize CharLS
    if(CharLS && !charLS) {
      charLS = CharLS();
    }

    // CharLS https://github.com/chafey/charls
    if(!charLS || !charLS.jpegLSDecode) {
      throw 'No JPEG-LS decoder loaded';
    }

    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');

    var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);

    var image = jpegLSDecode(encodedImageFrame);
    //console.log(image);
    if(image.result) {
      throw 'JPEG-LS decoder failed to decode frame (error code ' + image.result + ')';
    }

    if(image.width !== width) {
      throw 'JPEG-LS decoder returned width of ' + image.width + ', when ' + width + ' is expected';
    }
    if(image.height !== height) {
      throw 'JPEG-LS decoder returned width of ' + image.height + ', when ' + height + ' is expected';
    }

    return image.pixelData;
  }


  // module exports
  cornerstoneWADOImageLoader.decodeJPEGLS = decodeJPEGLS;

}(cornerstoneWADOImageLoader));