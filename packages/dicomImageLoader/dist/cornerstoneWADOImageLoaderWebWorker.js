/*! cornerstone-wado-image-loader - v0.14.0 - 2016-07-18 | (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */

cornerstoneWADOImageLoader = {};

function initializeTask(data) {
  //console.log('web worker initialize ', data.workerIndex);

  var config = data.config;

  //console.time('loadingCodecs');
  self.importScripts(config.codecsPath );
  //console.timeEnd('loadingCodecs');

  self.postMessage({
    message: 'initializeTaskCompleted',
    workerIndex: data.workerIndex
  });
}


function decodeTask(data) {
  var imageFrame = data.decodeTask.imageFrame;
  var pixelData = new Uint8Array(data.decodeTask.pixelData);
  var transferSyntax = data.decodeTask.transferSyntax;
  
  cornerstoneWADOImageLoader.decodeImageFrame(imageFrame, transferSyntax, pixelData);
  cornerstoneWADOImageLoader.calculateMinMax(imageFrame);

  imageFrame.pixelData = imageFrame.pixelData.buffer;

  self.postMessage({
    message: 'decodeTaskCompleted',
    imageFrame: imageFrame,
    workerIndex: data.workerIndex
  }, [imageFrame.pixelData]);
}


self.onmessage = function(msg) {
  //console.log('web worker onmessage', msg.data);
  if(msg.data.message === 'initializeTask') {
    initializeTask(msg.data);
  } else if(msg.data.message === 'decodeTask') {
    decodeTask(msg.data);
  }
};
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function calculateMinMax(imageFrame)
  {
    if(imageFrame.smallestPixelValue !== undefined && imageFrame.largestPixelValue !== undefined) {
      return;
    }
    var storedPixelData = imageFrame.pixelData;

    // we always calculate the min max values since they are not always
    // present in DICOM and we don't want to trust them anyway as cornerstone
    // depends on us providing reliable values for these
    var min = 65535;
    var max = -32768;
    var numPixels = storedPixelData.length;
    var pixelData = storedPixelData;
    for(var index = 0; index < numPixels; index++) {
      var spv = pixelData[index];
      // TODO: test to see if it is faster to use conditional here rather than calling min/max functions
      min = Math.min(min, spv);
      max = Math.max(max, spv);
    }

    imageFrame.smallestPixelValue = min;
    imageFrame.largestPixelValue = max;
  }

  // module exports
  cornerstoneWADOImageLoader.calculateMinMax = calculateMinMax;

}(cornerstoneWADOImageLoader));


/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeImageFrame(imageFrame, transferSyntax, pixelData) {
    var start = new Date().getTime();

    // Implicit VR Little Endian
    if(transferSyntax === "1.2.840.10008.1.2") {
      imageFrame = cornerstoneWADOImageLoader.decodeLittleEndian(imageFrame, pixelData);
    }
    // Explicit VR Little Endian
    else if(transferSyntax === "1.2.840.10008.1.2.1") {
      imageFrame = cornerstoneWADOImageLoader.decodeLittleEndian(imageFrame, pixelData);
    }
    // Explicit VR Big Endian (retired)
    else if (transferSyntax === "1.2.840.10008.1.2.2" ) {
      imageFrame = cornerstoneWADOImageLoader.decodeBigEndian(imageFrame, pixelData);
    }
    // Deflate transfer syntax (deflated by dicomParser)
    else if(transferSyntax === '1.2.840.10008.1.2.1.99') {
      imageFrame = cornerstoneWADOImageLoader.decodeLittleEndian(imageFrame, pixelData);
    }
    // RLE Lossless
    else if (transferSyntax === "1.2.840.10008.1.2.5" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeRLE(imageFrame, pixelData);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if (transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame, pixelData);
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if (transferSyntax === "1.2.840.10008.1.2.4.51")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame, pixelData);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14)
    else if (transferSyntax === "1.2.840.10008.1.2.4.57")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame, pixelData);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    else if (transferSyntax === "1.2.840.10008.1.2.4.70" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame, pixelData);
    }
    // JPEG-LS Lossless Image Compression
    else if (transferSyntax === "1.2.840.10008.1.2.4.80" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame, pixelData);
    }
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    else if (transferSyntax === "1.2.840.10008.1.2.4.81" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame, pixelData);
    }
    // JPEG 2000 Lossless
    else if (transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame, pixelData);
    }
    // JPEG 2000 Lossy
    else if (transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame, pixelData);
    }
    /* Don't know if these work...
     // JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)
     else if(transferSyntax === "1.2.840.10008.1.2.4.92")
     {
     return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
     }
     // JPEG 2000 Part 2 Multicomponent Image Compression
     else if(transferSyntax === "1.2.840.10008.1.2.4.93")
     {
     return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
     }
     */
    else
    {
      if(console && console.log) {
        console.log("Image cannot be decoded due to Unsupported transfer syntax " + transferSyntax);
      }
      throw "no decoder for transfer syntax " + transferSyntax;
    }

    var end = new Date().getTime();
    imageFrame.decodeTimeInMS = end - start;

    return imageFrame;
  }

  cornerstoneWADOImageLoader.decodeImageFrame = decodeImageFrame;
}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  function swap16(val) {
    return ((val & 0xFF) << 8)
      | ((val >> 8) & 0xFF);
  }


  function decodeBigEndian(imageFrame, pixelData) {
    if(imageFrame.bitsAllocated === 16) {
      var arrayBuffer = pixelData.buffer;
      var offset = pixelData.byteOffset;
      var length = pixelData.length;
      // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
      // buffers on it
      if(offset % 2) {
        arrayBuffer = arrayBuffer.slice(offset);
        offset = 0;
      }

      if(imageFrame.pixelRepresentation === 0) {
        imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
      } else {
        imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
      }
      // Do the byte swap
      for(var i=0; i < imageFrame.pixelData.length; i++) {
        imageFrame[i] = swap16(imageFrame.pixelData[i]);
      }

    } else if(imageFrame.bitsAllocated === 8) {
      imageFrame.pixelData = pixelData;
    }
    return imageFrame;
  }

  // module exports
  cornerstoneWADOImageLoader.decodeBigEndian = decodeBigEndian;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJpx(imageFrame, pixelData) {

    var jpxImage = new JpxImage();
    jpxImage.parse(pixelData);

    var tileCount = jpxImage.tiles.length;
    if(tileCount !== 1) {
      throw 'JPEG2000 decoder returned a tileCount of ' + tileCount + ', when 1 is expected';
    }

    imageFrame.columns = jpxImage.width;
    imageFrame.rows = jpxImage.height;
    imageFrame.pixelData = jpxImage.tiles[0].items;
    return imageFrame;
  }

  var openJPEG;

  function decodeOpenJPEG(data, bytesPerPixel, signed) {
    var dataPtr = openJPEG._malloc(data.length);
    openJPEG.writeArrayToMemory(data, dataPtr);

    // create param outpout
    var imagePtrPtr=openJPEG._malloc(4);
    var imageSizePtr=openJPEG._malloc(4);
    var imageSizeXPtr=openJPEG._malloc(4);
    var imageSizeYPtr=openJPEG._malloc(4);
    var imageSizeCompPtr=openJPEG._malloc(4);

    var t0 = Date.now();
    var ret = openJPEG.ccall('jp2_decode','number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [dataPtr, data.length, imagePtrPtr, imageSizePtr, imageSizeXPtr, imageSizeYPtr, imageSizeCompPtr]);
    // add num vomp..etc
    if(ret !== 0){
      console.log('[opj_decode] decoding failed!')
      openJPEG._free(dataPtr);
      openJPEG._free(openJPEG.getValue(imagePtrPtr, '*'));
      openJPEG._free(imageSizeXPtr);
      openJPEG._free(imageSizeYPtr);
      openJPEG._free(imageSizePtr);
      openJPEG._free(imageSizeCompPtr);
      return undefined;
    }

    var imagePtr = openJPEG.getValue(imagePtrPtr, '*')

    var image = {
      length : openJPEG.getValue(imageSizePtr,'i32'),
      sx :  openJPEG.getValue(imageSizeXPtr,'i32'),
      sy :  openJPEG.getValue(imageSizeYPtr,'i32'),
      nbChannels : openJPEG.getValue(imageSizeCompPtr,'i32'), // hard coded for now
      perf_timetodecode : undefined,
      pixelData : undefined
    };

    // Copy the data from the EMSCRIPTEN heap into the correct type array
    var length = image.sx*image.sy*image.nbChannels;
    var src32 = new Int32Array(openJPEG.HEAP32.buffer, imagePtr, length);
    if(bytesPerPixel === 1) {
      if(Uint8Array.from) {
        image.pixelData = Uint8Array.from(src32);
      } else {
        image.pixelData = new Uint8Array(length);
        for(var i=0; i < length; i++) {
          image.pixelData[i] = src32[i];
        }
      }
    } else {
      if (signed) {
        if(Int16Array.from) {
          image.pixelData = Int16Array.from(src32);
        } else {
          image.pixelData = new Int16Array(length);
          for(var i=0; i < length; i++) {
            image.pixelData[i] = src32[i];
          }
        }
      } else {
        if(Uint16Array.from) {
          image.pixelData = Uint16Array.from(src32);
        } else {
          image.pixelData = new Uint16Array(length);
          for(var i=0; i < length; i++) {
            image.pixelData[i] = src32[i];
          }
        }
      }
    }

    var t1 = Date.now();
    image.perf_timetodecode = t1-t0;

    // free
    openJPEG._free(dataPtr);
    openJPEG._free(imagePtrPtr);
    openJPEG._free(imagePtr);
    openJPEG._free(imageSizePtr);
    openJPEG._free(imageSizeXPtr);
    openJPEG._free(imageSizeYPtr);
    openJPEG._free(imageSizeCompPtr);

    return image;
  }

  function decodeOpenJpeg2000(imageFrame, pixelData) {
    var bytesPerPixel = imageFrame.bitsAllocated <= 8 ? 1 : 2;
    var signed = imageFrame.pixelRepresentation === 1;

    var image = decodeOpenJPEG(pixelData, bytesPerPixel, signed);

    imageFrame.columns = image.sx;
    imageFrame.rows = image.sy;
    imageFrame.pixelData = image.pixelData;
    if(image.nbChannels > 1) {
      imageFrame.photometricInterpretation = "RGB";
    }
    return imageFrame;
  }

  function decodeJPEG2000(imageFrame, pixelData)
  {
    // check to make sure codec is loaded
    if(typeof OpenJPEG === 'undefined' &&
      typeof JpxImage === 'undefined') {
      throw 'No JPEG2000 decoder loaded';
    }

    // OpenJPEG2000 https://github.com/jpambrun/openjpeg
    if(typeof OpenJPEG !== 'undefined') {
      // Initialize if it isn't already initialized
      if (!openJPEG) {
        openJPEG = OpenJPEG();
        if (!openJPEG || !openJPEG._jp2_decode) {
          throw 'OpenJPEG failed to initialize';
        }
      }
      return decodeOpenJpeg2000(imageFrame, pixelData);
    }

    // OHIF image-JPEG2000 https://github.com/OHIF/image-JPEG2000
    if(typeof JpxImage !== 'undefined') {
      return decodeJpx(imageFrame, pixelData);
    }
  }

  cornerstoneWADOImageLoader.decodeJPEG2000 = decodeJPEG2000;
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJPEGBaseline(imageFrame, pixelData)
  {
    // check to make sure codec is loaded
    if(typeof JpegImage === 'undefined') {
      throw 'No JPEG Baseline decoder loaded';
    }
    var jpeg = new JpegImage();
    jpeg.parse(pixelData);
    if(imageFrame.bitsAllocated === 8) {
      imageFrame.pixelData = jpeg.getData(imageFrame.columns, imageFrame.rows);
      return imageFrame;
    }
    else if(imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = jpeg.getData16(imageFrame.columns, imageFrame.rows);
      return imageFrame;
    }
  }

  cornerstoneWADOImageLoader.decodeJPEGBaseline = decodeJPEGBaseline;
}(cornerstoneWADOImageLoader));
/**
 * Special decoder for 8 bit jpeg that leverages the browser's built in JPEG decoder for increased performance
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function arrayBufferToString(buffer) {
    return binaryToString(String.fromCharCode.apply(null, Array.prototype.slice.apply(new Uint8Array(buffer))));
  }

  function binaryToString(binary) {
    var error;

    try {
      return decodeURIComponent(escape(binary));
    } catch (_error) {
      error = _error;
      if (error instanceof URIError) {
        return binary;
      } else {
        throw error;
      }
    }
  }

  function decodeJPEGBaseline8Bit(imageFrame, canvas) {
    var start = new Date().getTime();
    var deferred = $.Deferred();

    var imgBlob = new Blob([imageFrame.pixelData], {type: "image/jpeg"});

    var r = new FileReader();
    if(r.readAsBinaryString === undefined) {
      r.readAsArrayBuffer(imgBlob);
    }
    else {
      r.readAsBinaryString(imgBlob); // doesn't work on IE11
    }

    r.onload = function(){
      var img=new Image();
      img.onload = function() {
        canvas.height = img.height;
        canvas.width = img.width;
        imageFrame.rows = img.height;
        imageFrame.columns = img.width;
        var context = canvas.getContext('2d');
        context.drawImage(this, 0, 0);
        var imageData = context.getImageData(0, 0, img.width, img.height);
        var end = new Date().getTime();
        imageFrame.pixelData = imageData.data;
        imageFrame.imageData = imageData;
        imageFrame.decodeTimeInMS = end - start;
        deferred.resolve(imageFrame);
      };
      img.onerror = function(error) {
        deferred.reject(error);
      };
      if(r.readAsBinaryString === undefined) {
        img.src = "data:image/jpeg;base64,"+window.btoa(arrayBufferToString(r.result));
      }
      else {
        img.src = "data:image/jpeg;base64,"+window.btoa(r.result); // doesn't work on IE11
      }

    };
    return deferred.promise();
  }

  function isJPEGBaseline8Bit(imageFrame) {
    if((imageFrame.bitsAllocated === 8) &&
      imageFrame.transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      return true;
    }

  }

  // module exports
  cornerstoneWADOImageLoader.decodeJPEGBaseline8Bit = decodeJPEGBaseline8Bit;
  cornerstoneWADOImageLoader.isJPEGBaseline8Bit = isJPEGBaseline8Bit;

}(cornerstoneWADOImageLoader));
"use strict";
(function (cornerstoneWADOImageLoader) {

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
    var decompressedData = decoder.decode(buffer, buffer.byteOffset, buffer.length, byteOutput);
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
  // module exports
  cornerstoneWADOImageLoader.decodeJPEGLossless = decodeJPEGLossless;

}(cornerstoneWADOImageLoader));
"use strict";
(function (cornerstoneWADOImageLoader) {


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
      var src8 = new Uint8Array(charLS.HEAP8.buffer, imagePtr, image.pixelData.length);
      image.pixelData.set(src8);
    } else {
      // I have seen 16 bit signed images, but I don't know if 16 bit unsigned is valid, hoping to get
      // answer here:
      // https://github.com/team-charls/charls/issues/14
      if(isSigned) {
        image.pixelData = new Int16Array(image.width * image.height * image.components);
        var src16 = new Int16Array(charLS.HEAP16.buffer, imagePtr, image.pixelData.length);
        image.pixelData.set(src16);
      } else {
        image.pixelData = new Uint16Array(image.width * image.height * image.components);
        var src16 = new Uint16Array(charLS.HEAP16.buffer, imagePtr, image.pixelData.length);
        image.pixelData.set(src16);
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

  function decodeJPEGLS(imageFrame, pixelData)
  {
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

  // module exports
  cornerstoneWADOImageLoader.decodeJPEGLS = decodeJPEGLS;

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  function decodeLittleEndian(imageFrame, pixelData) {
    if(imageFrame.bitsAllocated === 16) {
      var arrayBuffer = pixelData.buffer;
      var offset = pixelData.byteOffset;
      var length = pixelData.length;
      // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
      // buffers on it
      if(offset % 2) {
        arrayBuffer = arrayBuffer.slice(offset);
        offset = 0;
      }

      if(imageFrame.pixelRepresentation === 0) {
        imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
      } else {
        imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
      }
    } else if(imageFrame.bitsAllocated === 8) {
      imageFrame.pixelData = pixelData;
    }
    return imageFrame;
  }

  // module exports
  cornerstoneWADOImageLoader.decodeLittleEndian = decodeLittleEndian;

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  function decodeRLE(imageFrame, pixelData) {

    if(imageFrame.bitsAllocated === 8) {
      return decode8(imageFrame, pixelData);
    } else if( imageFrame.bitsAllocated === 16) {
      return decode16(imageFrame, pixelData);
    } else {
      throw 'unsupported pixel format for RLE'
    }
  }

  function decode8(imageFrame, pixelData ) {
    var frameData = pixelData;
    var frameSize = imageFrame.rows * imageFrame.columns;
    var outFrame = new ArrayBuffer(frameSize*imageFrame.samplesPerPixel);
    var header=new DataView(frameData.buffer, frameData.byteOffset);
    var data=new DataView( frameData.buffer, frameData.byteOffset );
    var out=new DataView( outFrame );

    var outIndex=0;
    var numSegments = header.getInt32(0,true);
    for( var s=0 ; s < numSegments ; ++s ) {
      outIndex = s;

      var inIndex=header.getInt32( (s+1)*4,true);
      var maxIndex=header.getInt32( (s+2)*4,true);
      if( maxIndex===0 )
        maxIndex = frameData.length;

      var endOfSegment = frameSize * numSegments;

      while( inIndex < maxIndex ) {
        var n=data.getInt8(inIndex++);
        if( n >=0 && n <=127 ) {
          // copy n bytes
          for( var i=0 ; i < n+1 && outIndex < endOfSegment; ++i ) {
            out.setInt8(outIndex, data.getInt8(inIndex++));
            outIndex+=imageFrame.samplesPerPixel;
          }
        } else if( n<= -1 && n>=-127 ) {
          var value=data.getInt8(inIndex++);
          // run of n bytes
          for( var j=0 ; j < -n+1 && outIndex < endOfSegment; ++j ) {
            out.setInt8(outIndex, value );
            outIndex+=imageFrame.samplesPerPixel;
          }
        } else if (n===-128)
          ; // do nothing
      }
    }
    imageFrame.pixelData = new Uint8Array(outFrame);
    return imageFrame;
  }

  function decode16( imageFrame, pixelData ) {
    var frameData = pixelData;
    var frameSize = imageFrame.rows * imageFrame.columns;
    var outFrame = new ArrayBuffer(frameSize*imageFrame.samplesPerPixel*2);

    var header=new DataView(frameData.buffer, frameData.byteOffset);
    var data=new DataView( frameData.buffer, frameData.byteOffset );
    var out=new DataView( outFrame );

    var numSegments = header.getInt32(0,true);
    for( var s=0 ; s < numSegments ; ++s ) {
      var outIndex=0;
      var highByte=( s===0 ? 1 : 0);

      var inIndex=header.getInt32( (s+1)*4,true);
      var maxIndex=header.getInt32( (s+2)*4,true);
      if( maxIndex===0 )
        maxIndex = frameData.length;

      while( inIndex < maxIndex ) {
        var n=data.getInt8(inIndex++);
        if( n >=0 && n <=127 ) {
          for( var i=0 ; i < n+1 && outIndex < frameSize ; ++i ) {
            out.setInt8( (outIndex*2)+highByte, data.getInt8(inIndex++) );
            outIndex++;
          }
        } else if( n<= -1 && n>=-127 ) {
          var value=data.getInt8(inIndex++);
          for( var j=0 ; j < -n+1 && outIndex < frameSize ; ++j ) {
            out.setInt8( (outIndex*2)+highByte, value );
            outIndex++;
          }
        } else if (n===-128)
          ; // do nothing
      }
    }
    if(imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(outFrame);
    } else {
      imageFrame.pixelData = new Int16Array(outFrame);
    }
    return imageFrame;
  }

  // module exports
  cornerstoneWADOImageLoader.decodeRLE = decodeRLE;

}(cornerstoneWADOImageLoader));