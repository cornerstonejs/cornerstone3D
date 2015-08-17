/*! cornerstone-wado-image-loader - v0.6.2 - 2015-08-17 | (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */
//
// This is a cornerstone image loader for WADO-URI requests.  It has limited support for compressed
// transfer syntaxes, check here to see what is currently supported:
//
// https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/docs/TransferSyntaxes.md
//
// It will support implicit little endian transfer syntaxes but explicit little endian is strongly preferred
// to avoid any parsing issues related to SQ elements.  To request that the WADO object be returned as explicit little endian, append
// the following on your WADO url: &transferSyntax=1.2.840.10008.1.2.1
//

if(typeof cornerstone === 'undefined'){
  cornerstone = {};
}
if(typeof cornerstoneWADOImageLoader === 'undefined'){
  cornerstoneWADOImageLoader = {
    internal: {
      options : {
        // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
        beforeSend: function (xhr) {
        }
      },
      multiFrameCacheHack : {}
    }
  };
}


(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertRGB(dataSet, decodedImageFrame, rgbaBuffer) {
    var planarConfiguration = dataSet.uint16('x00280006');
    if(planarConfiguration === 0) {
      cornerstoneWADOImageLoader.convertRGBColorByPixel(decodedImageFrame, rgbaBuffer);
    } else {
      cornerstoneWADOImageLoader.convertRGBColorByPlane(decodedImageFrame, rgbaBuffer);
    }
  }

  function convertColorSpace(canvas, dataSet, imageFrame) {
    // extract the fields we need
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var photometricInterpretation = dataSet.string('x00280004');

    // setup the canvas context
    canvas.height = height;
    canvas.width = width;
    var context = canvas.getContext('2d');
    var imageData = context.createImageData(width, height);


    // convert based on the photometric interpretation
    var deferred = $.Deferred();
    try {
      if (photometricInterpretation === "RGB" )
      {
        convertRGB(dataSet, imageFrame, imageData.data);
      }
      else if (photometricInterpretation === "YBR_RCT")
      {
        convertRGB(dataSet, imageFrame, imageData.data);
      }
      else if (photometricInterpretation === "YBR_ICT")
      {
        convertRGB(dataSet, imageFrame, imageData.data);
      }
      else if( photometricInterpretation === "PALETTE COLOR" )
      {
        cornerstoneWADOImageLoader.convertPALETTECOLOR(imageFrame, imageData.data, dataSet );
      }
      else if( photometricInterpretation === "YBR_FULL_422" )
      {
        cornerstoneWADOImageLoader.convertYBRFull(imageFrame, imageData.data);
      }
      else if(photometricInterpretation === "YBR_FULL" )
      {
        cornerstoneWADOImageLoader.convertYBRFull(imageFrame, imageData.data);
      }
      else
      {
        throw "no color space conversion for photometric interpretation " + photometricInterpretation;
      }
      deferred.resolve(imageData);
      return deferred;
    } catch (error) {
      deferred.reject(error);
      return deferred;
    }
  }

  // module exports
  cornerstoneWADOImageLoader.convertColorSpace = convertColorSpace;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertPALETTECOLOR( imageFrame, rgbaBuffer, dataSet ) {
    var len=dataSet.int16('x00281101',0);
    var start=dataSet.int16('x00281101',1);
    var bits=dataSet.int16('x00281101',2);
    var shift = (bits===8 ? 0 : 8 );

    var buffer = dataSet.byteArray.buffer;
    var rData=new Uint16Array( buffer, dataSet.elements.x00281201.dataOffset, len );
    var gData=new Uint16Array( buffer, dataSet.elements.x00281202.dataOffset, len );
    var bData=new Uint16Array( buffer, dataSet.elements.x00281203.dataOffset, len );

    var numPixels = dataSet.uint16('x00280010') * dataSet.uint16('x00280011');
    var palIndex=0;
    var rgbaIndex=0;

    for( var i=0 ; i < numPixels ; ++i ) {
      var value=imageFrame[palIndex++];
      if( value < start )
        value=0;
      else if( value > start + len -1 )
        value=len-1;
      else
        value=value-start;

      rgbaBuffer[ rgbaIndex++ ] = rData[value] >> shift;
      rgbaBuffer[ rgbaIndex++ ] = gData[value] >> shift;
      rgbaBuffer[ rgbaIndex++ ] = bData[value] >> shift;
      rgbaBuffer[ rgbaIndex++ ] = 255;
    }

  }

  // module exports
  cornerstoneWADOImageLoader.convertPALETTECOLOR = convertPALETTECOLOR;

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

    "use strict";

    function convertRGBColorByPixel(imageFrame, rgbaBuffer) {
        if(imageFrame === undefined) {
            throw "decodeRGB: rgbBuffer must not be undefined";
        }
        if(imageFrame.length % 3 !== 0) {
            throw "decodeRGB: rgbBuffer length must be divisible by 3";
        }

        var numPixels = imageFrame.length / 3;
        var rgbIndex = 0;
        var rgbaIndex = 0;
        for(var i= 0; i < numPixels; i++) {
            rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // red
            rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // green
            rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // blue
            rgbaBuffer[rgbaIndex++] = 255; //alpha
        }
    }

    // module exports
    cornerstoneWADOImageLoader.convertRGBColorByPixel = convertRGBColorByPixel;
}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertRGBColorByPlane(imageFrame, rgbaBuffer) {
    if(imageFrame === undefined) {
      throw "decodeRGB: rgbBuffer must not be undefined";
    }
    if(imageFrame.length % 3 !== 0) {
      throw "decodeRGB: rgbBuffer length must be divisible by 3";
    }

    var numPixels = imageFrame.length / 3;
    var rgbaIndex = 0;
    for(var i= 0; i < numPixels; i++) {
      var rIndex = 0;
      var gIndex = numPixels;
      var bIndex = numPixels*2;
      for(var i= 0; i < numPixels; i++) {
        rgbaBuffer[rgbaIndex++] = imageFrame[rIndex++]; // red
        rgbaBuffer[rgbaIndex++] = imageFrame[gIndex++]; // green
        rgbaBuffer[rgbaIndex++] = imageFrame[bIndex++]; // blue
        rgbaBuffer[rgbaIndex++] = 255; //alpha
      }
    }
  }

  // module exports
  cornerstoneWADOImageLoader.convertRGBColorByPlane = convertRGBColorByPlane;
}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

    "use strict";

    function convertYBRFull(imageFrame, rgbaBuffer) {
        if(imageFrame === undefined) {
            throw "decodeRGB: ybrBuffer must not be undefined";
        }
        if(imageFrame.length % 3 !== 0) {
            throw "decodeRGB: ybrBuffer length must be divisble by 3";
        }

        var numPixels = imageFrame.length / 3;
        var ybrIndex = 0;
        var rgbaIndex = 0;
        for(var i= 0; i < numPixels; i++) {
            var y = imageFrame[ybrIndex++];
            var cb = imageFrame[ybrIndex++];
            var cr = imageFrame[ybrIndex++];
            rgbaBuffer[rgbaIndex++] = y + 1.40200 * (cr - 128);// red
            rgbaBuffer[rgbaIndex++] = y - 0.34414 * (cb -128) - 0.71414 * (cr- 128); // green
            rgbaBuffer[rgbaIndex++] = y + 1.77200 * (cb - 128); // blue
            rgbaBuffer[rgbaIndex++] = 255; //alpha
        }
    }

    // module exports
    cornerstoneWADOImageLoader.convertYBRFull = convertYBRFull;
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function configure(options) {
    cornerstoneWADOImageLoader.internal.options = options;
  }

  // module exports
  cornerstoneWADOImageLoader.configure = configure;

}(cornerstoneWADOImageLoader));

(function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    // Loads an image given an imageId
    // wado url example:
    // http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
    // NOTE: supposedly the instance will be returned in Explicit Little Endian transfer syntax if you don't
    // specify a transferSyntax but Osirix doesn't do this and seems to return it with the transfer syntax it is
    // stored as.
    function loadImage(imageId) {
        // create a deferred object

        // build a url by parsing out the url scheme and frame index from the imageId
        var firstColonIndex = imageId.indexOf(':');
        var url = imageId.substring(firstColonIndex + 1);
        var frameIndex = url.indexOf('frame=');
        var frame;
        if(frameIndex !== -1) {
            var frameStr = url.substr(frameIndex + 6);
            frame = parseInt(frameStr);
            url = url.substr(0, frameIndex-1);
        }

        // if multiframe and cached, use the cached data set to extract the frame
        if(frame !== undefined &&
          cornerstoneWADOImageLoader.internal.multiFrameCacheHack.hasOwnProperty(url))
        {
            var deferred = $.Deferred();
            var dataSet = cornerstoneWADOImageLoader.internal.multiFrameCacheHack[url];
            var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame);
            imagePromise.then(function(image) {
                deferred.resolve(image);
            }, function(error) {
                deferred.reject(error);
            });
            return deferred;
        }

        return cornerstoneWADOImageLoader.internal.xhrRequest(imageId, frame, url);
    }

    // registery dicomweb and wadouri image loader prefixes
    cornerstone.loadImage = loadImage;
    cornerstone.registerImageLoader('dicomweb', loadImage);
    cornerstone.registerImageLoader('wadouri', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function createImageObject( dataSet, imageId, frame ) {
    if(frame === undefined) {
      frame = 0;
    }

    // make the image based on whether it is color or not
    var photometricInterpretation = dataSet.string('x00280004');
    var isColor = cornerstoneWADOImageLoader.isColorImage(photometricInterpretation);
    if(isColor === false) {
      return cornerstoneWADOImageLoader.makeGrayscaleImage(imageId, dataSet, frame);
    } else {
      return cornerstoneWADOImageLoader.makeColorImage(imageId, dataSet, frame);
    }
  }

  // module exports
  cornerstoneWADOImageLoader.createImageObject = createImageObject;

}(cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  function decodeJPEG2000(dataSet, frame)
  {
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var compressedPixelData = dicomParser.readEncapsulatedPixelData(dataSet, dataSet.elements.x7fe00010, frame);
    var jpxImage = new JpxImage();
    jpxImage.parse(compressedPixelData);

    var j2kWidth = jpxImage.width;
    var j2kHeight = jpxImage.height;
    if(j2kWidth !== width) {
      throw 'JPEG2000 decoder returned width of ' + j2kWidth + ', when ' + width + ' is expected';
    }
    if(j2kHeight !== height) {
      throw 'JPEG2000 decoder returned width of ' + j2kHeight + ', when ' + height + ' is expected';
    }
    var tileCount = jpxImage.tiles.length;
    if(tileCount !== 1) {
      throw 'JPEG2000 decoder returned a tileCount of ' + tileCount + ', when 1 is expected';
    }
    var tileComponents = jpxImage.tiles[0];
    var pixelData = tileComponents.items;
    return pixelData;
  }

  cornerstoneWADOImageLoader.decodeJPEG2000 = decodeJPEG2000;
}($, cornerstone, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  function decodeJPEGBaseline(dataSet, frame)
  {
    var pixelDataElement = dataSet.elements.x7fe00010;
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var bitsAllocated = dataSet.uint16('x00280100');
    var frameData = dicomParser.readEncapsulatedPixelData(dataSet, pixelDataElement, frame);
    var jpeg = new JpegImage();
    jpeg.parse( frameData );
    if(bitsAllocated === 8) {
      return jpeg.getData(width, height);
    }
    else if(bitsAllocated === 16) {
      return jpeg.getData16(width, height);
    }
  }

  cornerstoneWADOImageLoader.decodeJPEGBaseline = decodeJPEGBaseline;
}($, cornerstone, cornerstoneWADOImageLoader));
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

  function decodeJPEGBaseline8Bit(canvas, dataSet, frame) {
    var deferred = $.Deferred();

    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    // resize the canvas
    canvas.height = height;
    canvas.width = width;

    var encodedPixelData = dicomParser.readEncapsulatedPixelData(dataSet, dataSet.elements.x7fe00010, frame);

    var imgBlob = new Blob([encodedPixelData], {type: "image/jpeg"});

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
        var context = canvas.getContext('2d');
        context.drawImage(this, 0, 0);
        var imageData = context.getImageData(0, 0, width, height);
        deferred.resolve(imageData);
      };
      img.onerror = function(z) {
        deferred.reject();
      };
      if(r.readAsBinaryString === undefined) {
        img.src = "data:image/jpeg;base64,"+window.btoa(arrayBufferToString(r.result));
      }
      else {
        img.src = "data:image/jpeg;base64,"+window.btoa(r.result); // doesn't work on IE11
      }

    };
    return deferred;
  }

  function isJPEGBaseline8Bit(dataSet) {
    var transferSyntax = dataSet.string('x00020010');
    var bitsAllocated = dataSet.uint16('x00280100');

    if((bitsAllocated === 8) &&
      transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      return true;
    }

  }

  // module exports
  cornerstoneWADOImageLoader.decodeJPEGBaseline8Bit = decodeJPEGBaseline8Bit;
  cornerstoneWADOImageLoader.isJPEGBaseline8Bit = isJPEGBaseline8Bit;

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  function decodeRLE(dataSet, frame) {
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var samplesPerPixel = dataSet.uint16('x00280002');
    var pixelDataElement = dataSet.elements.x7fe00010;

    var frameData = dicomParser.readEncapsulatedPixelData(dataSet, pixelDataElement, frame);
    var pixelFormat = cornerstoneWADOImageLoader.getPixelFormat(dataSet);


    var frameSize = width*height;
    var buffer;
    if( pixelFormat===1 ) {
      buffer = new ArrayBuffer(frameSize*samplesPerPixel);
      decode8( frameData, buffer, frameSize, samplesPerPixel);
      return new Uint8Array(buffer);
    } else if( pixelFormat===2 ) {
      buffer = new ArrayBuffer(frameSize*samplesPerPixel*2);
      decode16( frameData, buffer, frameSize );
      return new Uint16Array(buffer);
    } else if( pixelFormat===3 ) {
      buffer = new ArrayBuffer(frameSize*samplesPerPixel*2);
      decode16( frameData, buffer, frameSize );
      return new Int16Array(buffer);
    }
  }

  function decode8( frameData, outFrame, frameSize, samplesSize ) {
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
            outIndex+=samplesSize;
          }
        } else if( n<= -1 && n>=-127 ) {
          var value=data.getInt8(inIndex++);
          // run of n bytes
          for( var j=0 ; j < -n+1 && outIndex < endOfSegment; ++j ) {
            out.setInt8(outIndex, value );
            outIndex+=samplesSize;
          }
        } else if (n===-128)
          ; // do nothing
      }
    }
  }

  function decode16( frameData, outFrame, frameSize ) {
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
  }

  // module exports
  cornerstoneWADOImageLoader.decodeRLE = decodeRLE;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeTransferSyntax(dataSet, frame) {
    var transferSyntax = dataSet.string('x00020010');

    // Implicit VR Little Endian
    if( transferSyntax === "1.2.840.10008.1.2") {
      return cornerstoneWADOImageLoader.extractUncompressedPixels(dataSet, frame);
    }
    // Explicit VR Little Endian
    else if( transferSyntax === "1.2.840.10008.1.2.1") {
      return cornerstoneWADOImageLoader.extractUncompressedPixels(dataSet, frame);
    }
    // JPEG 2000 Lossless
    else if(transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
    }
    // JPEG 2000 Lossy
    else if(transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
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
    // RLE Lossless
    else if ( transferSyntax === "1.2.840.10008.1.2.5" )
    {
      return cornerstoneWADOImageLoader.decodeRLE( dataSet, frame);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if ( transferSyntax === "1.2.840.10008.1.2.4.50" )
    {
      return cornerstoneWADOImageLoader.decodeJPEGBaseline(dataSet, frame);
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if ( transferSyntax === "1.2.840.10008.1.2.4.51" )
    {
      return cornerstoneWADOImageLoader.decodeJPEGBaseline(dataSet, frame);
    }
    else
    {
      throw "no decoder for transfer syntax " + transferSyntax;
    }
  }

  // module exports
  cornerstoneWADOImageLoader.decodeTransferSyntax = decodeTransferSyntax;

}(cornerstoneWADOImageLoader));
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
// jshint ignore: start

/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
 /* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
 Copyright 2011 notmasteryet

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

// - The JPEG specification can be found in the ITU CCITT Recommendation T.81
//   (www.w3.org/Graphics/JPEG/itu-t81.pdf)
// - The JFIF specification can be found in the JPEG File Interchange Format
//   (www.w3.org/Graphics/JPEG/jfif3.pdf)
// - The Adobe Application-Specific JPEG markers in the Supporting the DCT Filters
//   in PostScript Level 2, Technical Note #5116
//   (partners.adobe.com/public/developer/en/ps/sdk/5116.DCT_Filter.pdf)

var ColorSpace = {Unkown: 0, Grayscale: 1, AdobeRGB: 2, RGB: 3, CYMK: 4};
var JpegImage = (function jpegImage() {
  "use strict";
  var dctZigZag = new Int32Array([
    0,
    1, 8,
    16, 9, 2,
    3, 10, 17, 24,
    32, 25, 18, 11, 4,
    5, 12, 19, 26, 33, 40,
    48, 41, 34, 27, 20, 13, 6,
    7, 14, 21, 28, 35, 42, 49, 56,
    57, 50, 43, 36, 29, 22, 15,
    23, 30, 37, 44, 51, 58,
    59, 52, 45, 38, 31,
    39, 46, 53, 60,
    61, 54, 47,
    55, 62,
    63
  ]);

  var dctCos1 = 4017;   // cos(pi/16)
  var dctSin1 = 799;   // sin(pi/16)
  var dctCos3 = 3406;   // cos(3*pi/16)
  var dctSin3 = 2276;   // sin(3*pi/16)
  var dctCos6 = 1567;   // cos(6*pi/16)
  var dctSin6 = 3784;   // sin(6*pi/16)
  var dctSqrt2 = 5793;   // sqrt(2)
  var dctSqrt1d2 = 2896;  // sqrt(2) / 2

  function constructor() {
  }

  function buildHuffmanTable(codeLengths, values) {
    var k = 0, code = [], i, j, length = 16;
    while (length > 0 && !codeLengths[length - 1])
      length--;
    code.push({children: [], index: 0});
    var p = code[0], q;
    for (i = 0; i < length; i++) {
      for (j = 0; j < codeLengths[i]; j++) {
        p = code.pop();
        p.children[p.index] = values[k];
        while (p.index > 0) {
          p = code.pop();
        }
        p.index++;
        code.push(p);
        while (code.length <= i) {
          code.push(q = {children: [], index: 0});
          p.children[p.index] = q.children;
          p = q;
        }
        k++;
      }
      if (i + 1 < length) {
        // p here points to last code
        code.push(q = {children: [], index: 0});
        p.children[p.index] = q.children;
        p = q;
      }
    }
    return code[0].children;
  }

  function getBlockBufferOffset(component, row, col) {
    return 64 * ((component.blocksPerLine + 1) * row + col);
  }

  function decodeScan(data, offset,
                      frame, components, resetInterval,
                      spectralStart, spectralEnd,
                      successivePrev, successive) {
    var precision = frame.precision;
    var samplesPerLine = frame.samplesPerLine;
    var scanLines = frame.scanLines;
    var mcusPerLine = frame.mcusPerLine;
    var progressive = frame.progressive;
    var maxH = frame.maxH, maxV = frame.maxV;

    var startOffset = offset, bitsData = 0, bitsCount = 0;

    function readBit() {
      if (bitsCount > 0) {
        bitsCount--;
        return (bitsData >> bitsCount) & 1;
      }
      bitsData = data[offset++];
      if (bitsData == 0xFF) {
        var nextByte = data[offset++];
        if (nextByte) {
          throw "unexpected marker: " + ((bitsData << 8) | nextByte).toString(16);
        }
        // unstuff 0
      }
      bitsCount = 7;
      return bitsData >>> 7;
    }

    function decodeHuffman(tree) {
      var node = tree;
      var bit;
      while ((bit = readBit()) !== null) {
        node = node[bit];
        if (typeof node === 'number')
          return node;
        if (typeof node !== 'object')
          throw "invalid huffman sequence";
      }
      return null;
    }

    function receive(length) {
      var n = 0;
      while (length > 0) {
        var bit = readBit();
        if (bit === null)
          return;
        n = (n << 1) | bit;
        length--;
      }
      return n;
    }

    function receiveAndExtend(length) {
      var n = receive(length);
      if (n >= 1 << (length - 1))
        return n;
      return n + (-1 << length) + 1;
    }

    function decodeBaseline(component, offset) {
      var t = decodeHuffman(component.huffmanTableDC);
      var diff = t === 0 ? 0 : receiveAndExtend(t);
      component.blockData[offset] = (component.pred += diff);
      var k = 1;
      while (k < 64) {
        var rs = decodeHuffman(component.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s === 0) {
          if (r < 15)
            break;
          k += 16;
          continue;
        }
        k += r;
        var z = dctZigZag[k];
        component.blockData[offset + z] = receiveAndExtend(s);
        k++;
      }
    }

    function decodeDCFirst(component, offset) {
      var t = decodeHuffman(component.huffmanTableDC);
      var diff = t === 0 ? 0 : (receiveAndExtend(t) << successive);
      component.blockData[offset] = (component.pred += diff);
    }

    function decodeDCSuccessive(component, offset) {
      component.blockData[offset] |= readBit() << successive;
    }

    var eobrun = 0;
    function decodeACFirst(component, offset) {
      if (eobrun > 0) {
        eobrun--;
        return;
      }
      var k = spectralStart, e = spectralEnd;
      while (k <= e) {
        var rs = decodeHuffman(component.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s === 0) {
          if (r < 15) {
            eobrun = receive(r) + (1 << r) - 1;
            break;
          }
          k += 16;
          continue;
        }
        k += r;
        var z = dctZigZag[k];
        component.blockData[offset + z] = receiveAndExtend(s) * (1 << successive);
        k++;
      }
    }

    var successiveACState = 0, successiveACNextValue;
    function decodeACSuccessive(component, offset) {
      var k = spectralStart, e = spectralEnd, r = 0;
      while (k <= e) {
        var z = dctZigZag[k];
        switch (successiveACState) {
          case 0: // initial state
            var rs = decodeHuffman(component.huffmanTableAC);
            var s = rs & 15;
            r = rs >> 4;
            if (s === 0) {
              if (r < 15) {
                eobrun = receive(r) + (1 << r);
                successiveACState = 4;
              } else {
                r = 16;
                successiveACState = 1;
              }
            } else {
              if (s !== 1)
                throw "invalid ACn encoding";
              successiveACNextValue = receiveAndExtend(s);
              successiveACState = r ? 2 : 3;
            }
            continue;
          case 1: // skipping r zero items
          case 2:
            if (component.blockData[offset + z]) {
              component.blockData[offset + z] += (readBit() << successive);
            } else {
              r--;
              if (r === 0)
                successiveACState = successiveACState == 2 ? 3 : 0;
            }
            break;
          case 3: // set value for a zero item
            if (component.blockData[offset + z]) {
              component.blockData[offset + z] += (readBit() << successive);
            } else {
              component.blockData[offset + z] = successiveACNextValue << successive;
              successiveACState = 0;
            }
            break;
          case 4: // eob
            if (component.blockData[offset + z]) {
              component.blockData[offset + z] += (readBit() << successive);
            }
            break;
        }
        k++;
      }
      if (successiveACState === 4) {
        eobrun--;
        if (eobrun === 0)
          successiveACState = 0;
      }
    }

    function decodeMcu(component, decode, mcu, row, col) {
      var mcuRow = (mcu / mcusPerLine) | 0;
      var mcuCol = mcu % mcusPerLine;
      var blockRow = mcuRow * component.v + row;
      var blockCol = mcuCol * component.h + col;
      var offset = getBlockBufferOffset(component, blockRow, blockCol);
      decode(component, offset);
    }

    function decodeBlock(component, decode, mcu) {
      var blockRow = (mcu / component.blocksPerLine) | 0;
      var blockCol = mcu % component.blocksPerLine;
      var offset = getBlockBufferOffset(component, blockRow, blockCol);
      decode(component, offset);
    }

    var componentsLength = components.length;
    var component, i, j, k, n;
    var decodeFn;
    if (progressive) {
      if (spectralStart === 0)
        decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
      else
        decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
    } else {
      decodeFn = decodeBaseline;
    }

    var mcu = 0, marker;
    var mcuExpected;
    if (componentsLength == 1) {
      mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
    } else {
      mcuExpected = mcusPerLine * frame.mcusPerColumn;
    }
    if (!resetInterval) {
      resetInterval = mcuExpected;
    }

    var h, v;
    while (mcu < mcuExpected) {
      // reset interval stuff
      for (i = 0; i < componentsLength; i++) {
        components[i].pred = 0;
      }
      eobrun = 0;

      if (componentsLength == 1) {
        component = components[0];
        for (n = 0; n < resetInterval; n++) {
          decodeBlock(component, decodeFn, mcu);
          mcu++;
        }
      } else {
        for (n = 0; n < resetInterval; n++) {
          for (i = 0; i < componentsLength; i++) {
            component = components[i];
            h = component.h;
            v = component.v;
            for (j = 0; j < v; j++) {
              for (k = 0; k < h; k++) {
                decodeMcu(component, decodeFn, mcu, j, k);
              }
            }
          }
          mcu++;
        }
      }

      // find marker
      bitsCount = 0;
      marker = (data[offset] << 8) | data[offset + 1];
      if (marker <= 0xFF00) {
        throw "marker was not found";
      }

      if (marker >= 0xFFD0 && marker <= 0xFFD7) { // RSTx
        offset += 2;
      } else {
        break;
      }
    }

    return offset - startOffset;
  }

  // A port of poppler's IDCT method which in turn is taken from:
  //   Christoph Loeffler, Adriaan Ligtenberg, George S. Moschytz,
  //   "Practical Fast 1-D DCT Algorithms with 11 Multiplications",
  //   IEEE Intl. Conf. on Acoustics, Speech & Signal Processing, 1989,
  //   988-991.
  function quantizeAndInverse(component, blockBufferOffset, p) {
    var qt = component.quantizationTable;
    var v0, v1, v2, v3, v4, v5, v6, v7, t;
    var i;

    // dequant
    for (i = 0; i < 64; i++) {
      p[i] = component.blockData[blockBufferOffset + i] * qt[i];
    }

    // inverse DCT on rows
    for (i = 0; i < 8; ++i) {
      var row = 8 * i;

      // check for all-zero AC coefficients
      if (p[1 + row] === 0 && p[2 + row] === 0 && p[3 + row] === 0 &&
        p[4 + row] === 0 && p[5 + row] === 0 && p[6 + row] === 0 &&
        p[7 + row] === 0) {
        t = (dctSqrt2 * p[0 + row] + 512) >> 10;
        p[0 + row] = t;
        p[1 + row] = t;
        p[2 + row] = t;
        p[3 + row] = t;
        p[4 + row] = t;
        p[5 + row] = t;
        p[6 + row] = t;
        p[7 + row] = t;
        continue;
      }

      // stage 4
      v0 = (dctSqrt2 * p[0 + row] + 128) >> 8;
      v1 = (dctSqrt2 * p[4 + row] + 128) >> 8;
      v2 = p[2 + row];
      v3 = p[6 + row];
      v4 = (dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128) >> 8;
      v7 = (dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128) >> 8;
      v5 = p[3 + row] << 4;
      v6 = p[5 + row] << 4;

      // stage 3
      t = (v0 - v1 + 1) >> 1;
      v0 = (v0 + v1 + 1) >> 1;
      v1 = t;
      t = (v2 * dctSin6 + v3 * dctCos6 + 128) >> 8;
      v2 = (v2 * dctCos6 - v3 * dctSin6 + 128) >> 8;
      v3 = t;
      t = (v4 - v6 + 1) >> 1;
      v4 = (v4 + v6 + 1) >> 1;
      v6 = t;
      t = (v7 + v5 + 1) >> 1;
      v5 = (v7 - v5 + 1) >> 1;
      v7 = t;

      // stage 2
      t = (v0 - v3 + 1) >> 1;
      v0 = (v0 + v3 + 1) >> 1;
      v3 = t;
      t = (v1 - v2 + 1) >> 1;
      v1 = (v1 + v2 + 1) >> 1;
      v2 = t;
      t = (v4 * dctSin3 + v7 * dctCos3 + 2048) >> 12;
      v4 = (v4 * dctCos3 - v7 * dctSin3 + 2048) >> 12;
      v7 = t;
      t = (v5 * dctSin1 + v6 * dctCos1 + 2048) >> 12;
      v5 = (v5 * dctCos1 - v6 * dctSin1 + 2048) >> 12;
      v6 = t;

      // stage 1
      p[0 + row] = v0 + v7;
      p[7 + row] = v0 - v7;
      p[1 + row] = v1 + v6;
      p[6 + row] = v1 - v6;
      p[2 + row] = v2 + v5;
      p[5 + row] = v2 - v5;
      p[3 + row] = v3 + v4;
      p[4 + row] = v3 - v4;
    }

    // inverse DCT on columns
    for (i = 0; i < 8; ++i) {
      var col = i;

      // check for all-zero AC coefficients
      if (p[1 * 8 + col] === 0 && p[2 * 8 + col] === 0 && p[3 * 8 + col] === 0 &&
        p[4 * 8 + col] === 0 && p[5 * 8 + col] === 0 && p[6 * 8 + col] === 0 &&
        p[7 * 8 + col] === 0) {
        t = (dctSqrt2 * p[i + 0] + 8192) >> 14;
        p[0 * 8 + col] = t;
        p[1 * 8 + col] = t;
        p[2 * 8 + col] = t;
        p[3 * 8 + col] = t;
        p[4 * 8 + col] = t;
        p[5 * 8 + col] = t;
        p[6 * 8 + col] = t;
        p[7 * 8 + col] = t;
        continue;
      }

      // stage 4
      v0 = (dctSqrt2 * p[0 * 8 + col] + 2048) >> 12;
      v1 = (dctSqrt2 * p[4 * 8 + col] + 2048) >> 12;
      v2 = p[2 * 8 + col];
      v3 = p[6 * 8 + col];
      v4 = (dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048) >> 12;
      v7 = (dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048) >> 12;
      v5 = p[3 * 8 + col];
      v6 = p[5 * 8 + col];

      // stage 3
      t = (v0 - v1 + 1) >> 1;
      v0 = (v0 + v1 + 1) >> 1;
      v1 = t;
      t = (v2 * dctSin6 + v3 * dctCos6 + 2048) >> 12;
      v2 = (v2 * dctCos6 - v3 * dctSin6 + 2048) >> 12;
      v3 = t;
      t = (v4 - v6 + 1) >> 1;
      v4 = (v4 + v6 + 1) >> 1;
      v6 = t;
      t = (v7 + v5 + 1) >> 1;
      v5 = (v7 - v5 + 1) >> 1;
      v7 = t;

      // stage 2
      t = (v0 - v3 + 1) >> 1;
      v0 = (v0 + v3 + 1) >> 1;
      v3 = t;
      t = (v1 - v2 + 1) >> 1;
      v1 = (v1 + v2 + 1) >> 1;
      v2 = t;
      t = (v4 * dctSin3 + v7 * dctCos3 + 2048) >> 12;
      v4 = (v4 * dctCos3 - v7 * dctSin3 + 2048) >> 12;
      v7 = t;
      t = (v5 * dctSin1 + v6 * dctCos1 + 2048) >> 12;
      v5 = (v5 * dctCos1 - v6 * dctSin1 + 2048) >> 12;
      v6 = t;

      // stage 1
      p[0 * 8 + col] = v0 + v7;
      p[7 * 8 + col] = v0 - v7;
      p[1 * 8 + col] = v1 + v6;
      p[6 * 8 + col] = v1 - v6;
      p[2 * 8 + col] = v2 + v5;
      p[5 * 8 + col] = v2 - v5;
      p[3 * 8 + col] = v3 + v4;
      p[4 * 8 + col] = v3 - v4;
    }

    // convert to 8-bit integers
    for (i = 0; i < 64; ++i) {
      var index = blockBufferOffset + i;
      var q = p[i];
      q = (q <= -2056 / component.bitConversion) ? 0 :
        (q >= 2024 / component.bitConversion) ? 255 / component.bitConversion :
        (q + 2056 / component.bitConversion) >> 4;
      component.blockData[index] = q;
    }
  }

  function buildComponentData(frame, component) {
    var lines = [];
    var blocksPerLine = component.blocksPerLine;
    var blocksPerColumn = component.blocksPerColumn;
    var samplesPerLine = blocksPerLine << 3;
    var computationBuffer = new Int32Array(64);

    var i, j, ll = 0;
    for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
      for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
        var offset = getBlockBufferOffset(component, blockRow, blockCol);
        quantizeAndInverse(component, offset, computationBuffer);
      }
    }
    return component.blockData;
  }

  function clampToUint8(a) {
    return a <= 0 ? 0 : a >= 255 ? 255 : a | 0;
  }

  constructor.prototype = {
    load: function load(path) {
      var handleData = (function (data) {
        this.parse(data);
        if (this.onload)
          this.onload();
      }).bind(this);

      if (path.indexOf("data:") > -1) {
        var offset = path.indexOf("base64,") + 7;
        var data = atob(path.substring(offset));
        var arr = new Uint8Array(data.length);
        for (var i = data.length - 1; i >= 0; i--) {
          arr[i] = data.charCodeAt(i);
        }
        handleData(data);
      } else {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", path, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = (function () {
          // TODO catch parse error
          var data = new Uint8Array(xhr.response);
          handleData(data);
        }).bind(this);
        xhr.send(null);
      }
    },
    parse: function parse(data) {

      function readUint16() {
        var value = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        return value;
      }

      function readDataBlock() {
        var length = readUint16();
        var array = data.subarray(offset, offset + length - 2);
        offset += array.length;
        return array;
      }

      function prepareComponents(frame) {
        var mcusPerLine = Math.ceil(frame.samplesPerLine / 8 / frame.maxH);
        var mcusPerColumn = Math.ceil(frame.scanLines / 8 / frame.maxV);
        for (var i = 0; i < frame.components.length; i++) {
          component = frame.components[i];
          var blocksPerLine = Math.ceil(Math.ceil(frame.samplesPerLine / 8) * component.h / frame.maxH);
          var blocksPerColumn = Math.ceil(Math.ceil(frame.scanLines / 8) * component.v / frame.maxV);
          var blocksPerLineForMcu = mcusPerLine * component.h;
          var blocksPerColumnForMcu = mcusPerColumn * component.v;

          var blocksBufferSize = 64 * blocksPerColumnForMcu * (blocksPerLineForMcu + 1);
          component.blockData = new Int16Array(blocksBufferSize);
          component.blocksPerLine = blocksPerLine;
          component.blocksPerColumn = blocksPerColumn;
        }
        frame.mcusPerLine = mcusPerLine;
        frame.mcusPerColumn = mcusPerColumn;
      }

      var offset = 0, length = data.length;
      var jfif = null;
      var adobe = null;
      var pixels = null;
      var frame, resetInterval;
      var quantizationTables = [];
      var huffmanTablesAC = [], huffmanTablesDC = [];
      var fileMarker = readUint16();
      if (fileMarker != 0xFFD8) { // SOI (Start of Image)
        throw "SOI not found";
      }

      fileMarker = readUint16();
      while (fileMarker != 0xFFD9) { // EOI (End of image)
        var i, j, l;
        switch (fileMarker) {
          case 0xFFE0: // APP0 (Application Specific)
          case 0xFFE1: // APP1
          case 0xFFE2: // APP2
          case 0xFFE3: // APP3
          case 0xFFE4: // APP4
          case 0xFFE5: // APP5
          case 0xFFE6: // APP6
          case 0xFFE7: // APP7
          case 0xFFE8: // APP8
          case 0xFFE9: // APP9
          case 0xFFEA: // APP10
          case 0xFFEB: // APP11
          case 0xFFEC: // APP12
          case 0xFFED: // APP13
          case 0xFFEE: // APP14
          case 0xFFEF: // APP15
          case 0xFFFE: // COM (Comment)
            var appData = readDataBlock();

            if (fileMarker === 0xFFE0) {
              if (appData[0] === 0x4A && appData[1] === 0x46 && appData[2] === 0x49 &&
                appData[3] === 0x46 && appData[4] === 0) { // 'JFIF\x00'
                jfif = {
                  version: {major: appData[5], minor: appData[6]},
                  densityUnits: appData[7],
                  xDensity: (appData[8] << 8) | appData[9],
                  yDensity: (appData[10] << 8) | appData[11],
                  thumbWidth: appData[12],
                  thumbHeight: appData[13],
                  thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                };
              }
            }
            // TODO APP1 - Exif
            if (fileMarker === 0xFFEE) {
              if (appData[0] === 0x41 && appData[1] === 0x64 && appData[2] === 0x6F &&
                appData[3] === 0x62 && appData[4] === 0x65 && appData[5] === 0) { // 'Adobe\x00'
                adobe = {
                  version: appData[6],
                  flags0: (appData[7] << 8) | appData[8],
                  flags1: (appData[9] << 8) | appData[10],
                  transformCode: appData[11]
                };
              }
            }
            break;

          case 0xFFDB: // DQT (Define Quantization Tables)
            var quantizationTablesLength = readUint16();
            var quantizationTablesEnd = quantizationTablesLength + offset - 2;
            while (offset < quantizationTablesEnd) {
              var quantizationTableSpec = data[offset++];
              var tableData = new Int32Array(64);
              if ((quantizationTableSpec >> 4) === 0) { // 8 bit values
                for (j = 0; j < 64; j++) {
                  var z = dctZigZag[j];
                  tableData[z] = data[offset++];
                }
              } else if ((quantizationTableSpec >> 4) === 1) { //16 bit
                for (j = 0; j < 64; j++) {
                  var zz = dctZigZag[j];
                  tableData[zz] = readUint16();
                }
              } else
                throw "DQT: invalid table spec";
              quantizationTables[quantizationTableSpec & 15] = tableData;
            }
            break;

          case 0xFFC0: // SOF0 (Start of Frame, Baseline DCT)
          case 0xFFC1: // SOF1 (Start of Frame, Extended DCT)
          case 0xFFC2: // SOF2 (Start of Frame, Progressive DCT)
            if (frame) {
              throw "Only single frame JPEGs supported";
            }
            readUint16(); // skip data length
            frame = {};
            frame.extended = (fileMarker === 0xFFC1);
            frame.progressive = (fileMarker === 0xFFC2);
            frame.precision = data[offset++];
            frame.scanLines = readUint16();
            frame.samplesPerLine = readUint16();
            frame.components = [];
            frame.componentIds = {};
            var componentsCount = data[offset++], componentId;
            var maxH = 0, maxV = 0;
            for (i = 0; i < componentsCount; i++) {
              componentId = data[offset];
              var h = data[offset + 1] >> 4;
              var v = data[offset + 1] & 15;
              if (maxH < h)
                maxH = h;
              if (maxV < v)
                maxV = v;
              var qId = data[offset + 2];
              l = frame.components.push({
                h: h,
                v: v,
                quantizationTable: quantizationTables[qId],
                quantizationTableId: qId,
                bitConversion: 255 / ((1 << frame.precision) - 1)
              });
              frame.componentIds[componentId] = l - 1;
              offset += 3;
            }
            frame.maxH = maxH;
            frame.maxV = maxV;
            prepareComponents(frame);
            break;

          case 0xFFC4: // DHT (Define Huffman Tables)
            var huffmanLength = readUint16();
            for (i = 2; i < huffmanLength; ) {
              var huffmanTableSpec = data[offset++];
              var codeLengths = new Uint8Array(16);
              var codeLengthSum = 0;
              for (j = 0; j < 16; j++, offset++)
                codeLengthSum += (codeLengths[j] = data[offset]);
              var huffmanValues = new Uint8Array(codeLengthSum);
              for (j = 0; j < codeLengthSum; j++, offset++)
                huffmanValues[j] = data[offset];
              i += 17 + codeLengthSum;

              ((huffmanTableSpec >> 4) === 0 ?
                huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] =
                buildHuffmanTable(codeLengths, huffmanValues);
            }
            break;

          case 0xFFDD: // DRI (Define Restart Interval)
            readUint16(); // skip data length
            resetInterval = readUint16();
            break;

          case 0xFFDA: // SOS (Start of Scan)
            var scanLength = readUint16();
            var selectorsCount = data[offset++];
            var components = [], component;
            for (i = 0; i < selectorsCount; i++) {
              var componentIndex = frame.componentIds[data[offset++]];
              component = frame.components[componentIndex];
              var tableSpec = data[offset++];
              component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
              component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
              components.push(component);
            }
            var spectralStart = data[offset++];
            var spectralEnd = data[offset++];
            var successiveApproximation = data[offset++];
            var processed = decodeScan(data, offset,
              frame, components, resetInterval,
              spectralStart, spectralEnd,
              successiveApproximation >> 4, successiveApproximation & 15);
            offset += processed;
            break;
          default:
            if (data[offset - 3] == 0xFF &&
              data[offset - 2] >= 0xC0 && data[offset - 2] <= 0xFE) {
              // could be incorrect encoding -- last 0xFF byte of the previous
              // block was eaten by the encoder
              offset -= 3;
              break;
            }
            throw "unknown JPEG marker " + fileMarker.toString(16);
        }
        fileMarker = readUint16();
      }

      this.width = frame.samplesPerLine;
      this.height = frame.scanLines;
      this.jfif = jfif;
      this.adobe = adobe;
      this.components = [];
      switch (frame.components.length)
      {
        case 1:
          this.colorspace = ColorSpace.Grayscale;
          break;
        case 3:
          if (this.adobe)
            this.colorspace = ColorSpace.AdobeRGB;
          else
            this.colorspace = ColorSpace.RGB;
          break;
        case 4:
          this.colorspace = ColorSpace.CYMK;
          break;
        default:
          this.colorspace = ColorSpace.Unknown;
      }
      for (var i = 0; i < frame.components.length; i++) {
        var component = frame.components[i];
        if (!component.quantizationTable && component.quantizationTableId !== null)
          component.quantizationTable = quantizationTables[component.quantizationTableId];
        this.components.push({
          output: buildComponentData(frame, component),
          scaleX: component.h / frame.maxH,
          scaleY: component.v / frame.maxV,
          blocksPerLine: component.blocksPerLine,
          blocksPerColumn: component.blocksPerColumn,
          bitConversion: component.bitConversion
        });
      }
    },
    getData16: function getData16(width, height) {
      if (this.components.length !== 1)
        throw 'Unsupported color mode';
      var scaleX = this.width / width, scaleY = this.height / height;

      var component, componentScaleX, componentScaleY;
      var x, y, i;
      var offset = 0;
      var numComponents = this.components.length;
      var dataLength = width * height * numComponents;
      var data = new Uint16Array(dataLength);
      var componentLine;

      // lineData is reused for all components. Assume first component is
      // the biggest
      var lineData = new Uint16Array((this.components[0].blocksPerLine << 3) *
      this.components[0].blocksPerColumn * 8);

      // First construct image data ...
      for (i = 0; i < numComponents; i++) {
        component = this.components[i];
        var blocksPerLine = component.blocksPerLine;
        var blocksPerColumn = component.blocksPerColumn;
        var samplesPerLine = blocksPerLine << 3;

        var j, k, ll = 0;
        var lineOffset = 0;
        for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
          var scanLine = blockRow << 3;
          for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
            var bufferOffset = getBlockBufferOffset(component, blockRow, blockCol);
            var offset = 0, sample = blockCol << 3;
            for (j = 0; j < 8; j++) {
              var lineOffset = (scanLine + j) * samplesPerLine;
              for (k = 0; k < 8; k++) {
                lineData[lineOffset + sample + k] =
                  component.output[bufferOffset + offset++];
              }
            }
          }
        }

        componentScaleX = component.scaleX * scaleX;
        componentScaleY = component.scaleY * scaleY;
        offset = i;

        var cx, cy;
        var index;
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            cy = 0 | (y * componentScaleY);
            cx = 0 | (x * componentScaleX);
            index = cy * samplesPerLine + cx;
            data[offset] = lineData[index];
            offset += numComponents;
          }
        }
      }
      return data;
    },
    getData: function getData(width, height) {
      var scaleX = this.width / width, scaleY = this.height / height;

      var component, componentScaleX, componentScaleY;
      var x, y, i;
      var offset = 0;
      var Y, Cb, Cr, K, C, M, Ye, R, G, B;
      var colorTransform;
      var numComponents = this.components.length;
      var dataLength = width * height * numComponents;
      var data = new Uint8Array(dataLength);
      var componentLine;

      // lineData is reused for all components. Assume first component is
      // the biggest
      var lineData = new Uint8Array((this.components[0].blocksPerLine << 3) *
      this.components[0].blocksPerColumn * 8);

      // First construct image data ...
      for (i = 0; i < numComponents; i++) {
        component = this.components[i];
        var blocksPerLine = component.blocksPerLine;
        var blocksPerColumn = component.blocksPerColumn;
        var samplesPerLine = blocksPerLine << 3;

        var j, k, ll = 0;
        var lineOffset = 0;
        for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
          var scanLine = blockRow << 3;
          for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
            var bufferOffset = getBlockBufferOffset(component, blockRow, blockCol);
            var offset = 0, sample = blockCol << 3;
            for (j = 0; j < 8; j++) {
              var lineOffset = (scanLine + j) * samplesPerLine;
              for (k = 0; k < 8; k++) {
                lineData[lineOffset + sample + k] =
                  component.output[bufferOffset + offset++] * component.bitConversion;
              }
            }
          }
        }

        componentScaleX = component.scaleX * scaleX;
        componentScaleY = component.scaleY * scaleY;
        offset = i;

        var cx, cy;
        var index;
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            cy = 0 | (y * componentScaleY);
            cx = 0 | (x * componentScaleX);
            index = cy * samplesPerLine + cx;
            data[offset] = lineData[index];
            offset += numComponents;
          }
        }
      }

      // ... then transform colors, if necessary
      switch (numComponents) {
        case 1:
        case 2:
          break;
        // no color conversion for one or two compoenents

        case 3:
          // The default transform for three components is true
          colorTransform = true;
          // The adobe transform marker overrides any previous setting
          if (this.adobe && this.adobe.transformCode)
            colorTransform = true;
          else if (typeof this.colorTransform !== 'undefined')
            colorTransform = !!this.colorTransform;

          if (colorTransform) {
            for (i = 0; i < dataLength; i += numComponents) {
              Y = data[i    ];
              Cb = data[i + 1];
              Cr = data[i + 2];

              R = clampToUint8(Y - 179.456 + 1.402 * Cr);
              G = clampToUint8(Y + 135.459 - 0.344 * Cb - 0.714 * Cr);
              B = clampToUint8(Y - 226.816 + 1.772 * Cb);

              data[i    ] = R;
              data[i + 1] = G;
              data[i + 2] = B;
            }
          }
          break;
        case 4:
          if (!this.adobe)
            throw 'Unsupported color mode (4 components)';
          // The default transform for four components is false
          colorTransform = false;
          // The adobe transform marker overrides any previous setting
          if (this.adobe && this.adobe.transformCode)
            colorTransform = true;
          else if (typeof this.colorTransform !== 'undefined')
            colorTransform = !!this.colorTransform;

          if (colorTransform) {
            for (i = 0; i < dataLength; i += numComponents) {
              Y = data[i];
              Cb = data[i + 1];
              Cr = data[i + 2];

              C = clampToUint8(434.456 - Y - 1.402 * Cr);
              M = clampToUint8(119.541 - Y + 0.344 * Cb + 0.714 * Cr);
              Y = clampToUint8(481.816 - Y - 1.772 * Cb);

              data[i    ] = C;
              data[i + 1] = M;
              data[i + 2] = Y;
              // K is unchanged
            }
          }
          break;
        default:
          throw 'Unsupported color mode';
      }
      return data;
    }
  };

  return constructor;
})();
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getPixelFormat(dataSet) {
    var pixelRepresentation = dataSet.uint16('x00280103');
    var bitsAllocated = dataSet.uint16('x00280100');
    if(pixelRepresentation === 0 && bitsAllocated === 8) {
      return 1; // unsigned 8 bit
    } else if(pixelRepresentation === 0 && bitsAllocated === 16) {
      return 2; // unsigned 16 bit
    } else if(pixelRepresentation === 1 && bitsAllocated === 16) {
      return 3; // signed 16 bit data
    }
  }


  // module exports
  cornerstoneWADOImageLoader.getPixelFormat = getPixelFormat;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

    "use strict";

    function getPixelSpacing(dataSet)
    {
        // NOTE - these are not required for all SOP Classes
        // so we return them as undefined.  We also do not
        // deal with the complexity associated with projection
        // radiographs here and leave that to a higher layer
        var pixelSpacing = dataSet.string('x00280030');
        if(pixelSpacing && pixelSpacing.length > 0) {
            var split = pixelSpacing.split('\\');
            return {
                row: parseFloat(split[0]),
                column: parseFloat(split[1])
            };
        }
        else {
            return {
                row: undefined,
                column: undefined
            };
        }
    }
    // module exports
    cornerstoneWADOImageLoader.getPixelSpacing = getPixelSpacing;
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

    "use strict";

    function getRescaleSlopeAndIntercept(dataSet)
    {
        // NOTE - we default these to an identity transform since modality LUT
        // module is not required for all SOP Classes
        var result = {
            intercept : 0.0,
            slope: 1.0
        };

        var rescaleIntercept = dataSet.floatString('x00281052');
        var rescaleSlope = dataSet.floatString('x00281053');

        if(rescaleIntercept ) {
            result.intercept = rescaleIntercept;
        }
        if(rescaleSlope ) {
            result.slope = rescaleSlope;
        }
        return result;
    }

    // module exports
    cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept = getRescaleSlopeAndIntercept;
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

    "use strict";

    function getWindowWidthAndCenter(dataSet)
    {
        // NOTE - Default these to undefined since they may not be present as
        // they are not present or required for all sop classes.  We leave it up
        // to a higher layer to determine reasonable default values for these
        // if they are not provided.  We also use the first ww/wc values if
        // there are multiple and again leave it up the higher levels to deal with
        // this
        var result = {
            windowCenter : undefined,
            windowWidth: undefined
        };

        var windowCenter = dataSet.floatString('x00281050');
        var windowWidth = dataSet.floatString('x00281051');

        if(windowCenter) {
            result.windowCenter = windowCenter;
        }
        if(windowWidth ) {
            result.windowWidth = windowWidth;
        }
        return result;
    }

    // module exports
    cornerstoneWADOImageLoader.getWindowWidthAndCenter = getWindowWidthAndCenter;
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var options = {
    // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
    beforeSend : function(xhr) {}
  };

  function configure(opts) {
    options = opts;
  }

  function isColorImage(photoMetricInterpretation)
  {
    if(photoMetricInterpretation === "RGB" ||
      photoMetricInterpretation === "PALETTE COLOR" ||
      photoMetricInterpretation === "YBR_FULL" ||
      photoMetricInterpretation === "YBR_FULL_422" ||
      photoMetricInterpretation === "YBR_PARTIAL_422" ||
      photoMetricInterpretation === "YBR_PARTIAL_420" ||
      photoMetricInterpretation === "YBR_RCT" ||
      photoMetricInterpretation === "YBR_ICT")
    {
      return true;
    }
    else
    {
      return false;
    }
  }

  cornerstoneWADOImageLoader.isColorImage = isColorImage;

}(cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    var canvas = document.createElement('canvas');
    var lastImageIdDrawn = "";

    function extractStoredPixels(dataSet, frame) {

        // special case for JPEG Baseline 8 bit
        if(cornerstoneWADOImageLoader.isJPEGBaseline8Bit(dataSet) === true)
        {
          return cornerstoneWADOImageLoader.decodeJPEGBaseline8Bit(canvas, dataSet, frame);
        }

        var decodedImageFrame = cornerstoneWADOImageLoader.decodeTransferSyntax(dataSet, frame);

        return cornerstoneWADOImageLoader.convertColorSpace(canvas, dataSet, decodedImageFrame);
    }

    function makeColorImage(imageId, dataSet, frame) {

        // extract the DICOM attributes we need
        var pixelSpacing = cornerstoneWADOImageLoader.getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept(dataSet);
        var bytesPerPixel = 4;
        var numPixels = rows * columns;
        var sizeInBytes = numPixels * bytesPerPixel;
        var windowWidthAndCenter = cornerstoneWADOImageLoader.getWindowWidthAndCenter(dataSet);

        // clear the lastImageIdDrawn so we update the canvas
        lastImageIdDrawn = undefined;

        var deferred = $.Deferred();

        // Decompress and decode the pixel data for this image
        var imageDataPromise;
        try {
          imageDataPromise = extractStoredPixels(dataSet, frame);
        }
        catch(err) {
          deferred.reject(err);
          return deferred;
        }

        imageDataPromise.then(function(imageData) {
            function getPixelData() {
                return imageData.data;
            }

            function getImageData() {
                return imageData;
            }

            function getCanvas() {
                if(lastImageIdDrawn === imageId) {
                    return canvas;
                }

                canvas.height = rows;
                canvas.width = columns;
                var context = canvas.getContext('2d');
                context.putImageData(imageData, 0, 0 );
                lastImageIdDrawn = imageId;
                return canvas;
            }

            // Extract the various attributes we need
            var image = {
                imageId : imageId,
                minPixelValue : 0,
                maxPixelValue : 255,
                slope: rescaleSlopeAndIntercept.slope,
                intercept: rescaleSlopeAndIntercept.intercept,
                windowCenter : windowWidthAndCenter.windowCenter,
                windowWidth : windowWidthAndCenter.windowWidth,
                render: cornerstone.renderColorImage,
                getPixelData: getPixelData,
                getImageData: getImageData,
                getCanvas: getCanvas,
                rows: rows,
                columns: columns,
                height: rows,
                width: columns,
                color: true,
                columnPixelSpacing: pixelSpacing.column,
                rowPixelSpacing: pixelSpacing.row,
                data: dataSet,
                invert: false,
                sizeInBytes: sizeInBytes
            };

            if(image.windowCenter === undefined) {
                image.windowWidth = 255;
                image.windowCenter = 128;
            }
            deferred.resolve(image);
        }, function(error) {
            deferred.reject(error);
        });

        return deferred;
    }

    // module exports
    cornerstoneWADOImageLoader.makeColorImage = makeColorImage;
}($, cornerstone, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    function getBytesPerPixel(dataSet)
    {
        var pixelFormat = cornerstoneWADOImageLoader.getPixelFormat(dataSet);
        if(pixelFormat ===1) {
            return 1;
        }
        else if(pixelFormat ===2 || pixelFormat ===3){
            return 2;
        }
        throw "unknown pixel format";
    }

    function getMinMax(storedPixelData)
    {
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

        return {
            min: min,
            max: max
        };
    }

    function makeGrayscaleImage(imageId, dataSet, frame) {
        var deferred = $.Deferred();

        // extract the DICOM attributes we need
        var pixelSpacing = cornerstoneWADOImageLoader.getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept(dataSet);
        
        var bytesPerPixel;
        try {
            bytesPerPixel = getBytesPerPixel(dataSet);
        } catch(error) {
            deferred.reject(error);
            return deferred;
        }

        var numPixels = rows * columns;
        var sizeInBytes = numPixels * bytesPerPixel;
        var photometricInterpretation = dataSet.string('x00280004');
        var invert = (photometricInterpretation === "MONOCHROME1");
        var windowWidthAndCenter = cornerstoneWADOImageLoader.getWindowWidthAndCenter(dataSet);

        // Decompress and decode the pixel data for this image
        var storedPixelData;
        try {
          storedPixelData = cornerstoneWADOImageLoader.decodeTransferSyntax(dataSet, frame);
        }
        catch(err) {
          deferred.reject(err);
          return deferred;
        }

        var minMax = getMinMax(storedPixelData);

        function getPixelData() {
            return storedPixelData;
        }

        // Extract the various attributes we need
        var image = {
            imageId : imageId,
            minPixelValue : minMax.min,
            maxPixelValue : minMax.max,
            slope: rescaleSlopeAndIntercept.slope,
            intercept: rescaleSlopeAndIntercept.intercept,
            windowCenter : windowWidthAndCenter.windowCenter,
            windowWidth : windowWidthAndCenter.windowWidth,
            render: cornerstone.renderGrayscaleImage,
            getPixelData: getPixelData,
            rows: rows,
            columns: columns,
            height: rows,
            width: columns,
            color: false,
            columnPixelSpacing: pixelSpacing.column,
            rowPixelSpacing: pixelSpacing.row,
            data: dataSet,
            invert: invert,
            sizeInBytes: sizeInBytes
        };

        // TODO: deal with pixel padding and all of the various issues by setting it to min pixel value (or lower)
        // TODO: Mask out overlays embedded in pixel data above high bit

        if(image.windowCenter === undefined) {
            var maxVoi = image.maxPixelValue * image.slope + image.intercept;
            var minVoi = image.minPixelValue * image.slope + image.intercept;
            image.windowWidth = maxVoi - minVoi;
            image.windowCenter = (maxVoi + minVoi) / 2;
        }

        deferred.resolve(image);
        return deferred;
    }

    // module exports
    cornerstoneWADOImageLoader.makeGrayscaleImage = makeGrayscaleImage;
}($, cornerstone, cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  // module exports
  cornerstoneWADOImageLoader.version = '0.6.1';

}(cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function xhrRequest(imageId, frame, url) {

    var deferred = $.Deferred();

    // Make the request for the DICOM P10 SOP Instance
    var xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";
    xhr.open("get", url, true);
    cornerstoneWADOImageLoader.internal.options.beforeSend(xhr);
    xhr.onreadystatechange = function (oEvent) {
      // TODO: consider sending out progress messages here as we receive the pixel data
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // request succeeded, create an image object and resolve the deferred

          // Parse the DICOM File
          var dicomPart10AsArrayBuffer = xhr.response;
          var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
          var dataSet = dicomParser.parseDicom(byteArray);

          // if multiframe, cache the parsed data set to speed up subsequent
          // requests for the other frames
          if (frame !== undefined) {
            cornerstoneWADOImageLoader.internal.multiFrameCacheHack[url] = dataSet;
          }

          var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame);
          imagePromise.then(function (image) {
            deferred.resolve(image);
          }, function (error) {
            deferred.reject(error);
          });
        }
        else {
          // request failed, reject the deferred
          deferred.reject(xhr.response);
        }
      }
    };
    xhr.onprogress = function (oProgress) {
      // console.log('progress:',oProgress)

      if (oProgress.lengthComputable) {  //evt.loaded the bytes browser receive
        //evt.total the total bytes seted by the header
        //
        var loaded = oProgress.loaded;
        var total = oProgress.total;
        var percentComplete = Math.round((loaded / total) * 100);

        $(cornerstone).trigger('CornerstoneImageLoadProgress', {
          imageId: imageId,
          loaded: loaded,
          total: total,
          percentComplete: percentComplete
        });
      }
    };

    xhr.send();

    return deferred;
  }

  cornerstoneWADOImageLoader.internal.xhrRequest = xhrRequest;
}($, cornerstone, cornerstoneWADOImageLoader));