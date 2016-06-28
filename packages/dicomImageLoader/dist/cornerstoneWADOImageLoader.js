/*! cornerstone-wado-image-loader - v0.14.0 - 2016-06-25 | (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */
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
        },
        // callback allowing modification of newly created image objects
        imageCreated : function(image) {
        }
      }
    }
  };
}



(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // add a decache callback function to clear out our dataSetCacheManager
  function addDecache(image) {
    image.decache = function() {
      //console.log('decache');
      var parsedImageId = cornerstoneWADOImageLoader.parseImageId(image.imageId);
      cornerstoneWADOImageLoader.dataSetCacheManager.unload(parsedImageId.url);
    };
  }

  function loadDataSetFromPromise(xhrRequestPromise, imageId, frame, sharedCacheKey) {
    var deferred = $.Deferred();
    xhrRequestPromise.then(function(dataSet) {
      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame, sharedCacheKey);
      imagePromise.then(function(image) {
        addDecache(image);
        deferred.resolve(image);
      }, function(error) {
        deferred.reject(error);
      });
    }, function(error) {
      deferred.reject(error);
    });
    return deferred;
  }

  function getLoaderForScheme(scheme) {
    if(scheme === 'dicomweb' || scheme === 'wadouri') {
      return cornerstoneWADOImageLoader.internal.xhrRequest;
    }
    else if(scheme === 'dicomfile') {
      return cornerstoneWADOImageLoader.internal.loadFileRequest;
    }
  }

  function loadImage(imageId) {
    var start = new Date().getTime();

    var parsedImageId = cornerstoneWADOImageLoader.parseImageId(imageId);

    var loader = getLoaderForScheme(parsedImageId.scheme);

    // if the dataset for this url is already loaded, use it
    if(cornerstoneWADOImageLoader.dataSetCacheManager.isLoaded(parsedImageId.url)) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.dataSetCacheManager.load(parsedImageId.url, loader), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // if multiframe, load the dataSet via the dataSetCacheManager to keep it in memory
    if(parsedImageId.frame !== undefined) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.dataSetCacheManager.load(parsedImageId.url, loader), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // not multiframe, load it directly and let cornerstone cache manager its lifetime
    var deferred = $.Deferred();
    var xhrRequestPromise =  loader(parsedImageId.url, imageId);
    xhrRequestPromise.then(function(dataSet) {
      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, parsedImageId.frame);
      imagePromise.then(function(image) {
        addDecache(image);
        var end = new Date().getTime();
        image.loadTimeInMS = end - start;
        deferred.resolve(image);
      }, function(error) {
        deferred.reject(error);
      });
    }, function(error) {
      deferred.reject(error);
    });
    return deferred;
  }

  // register dicomweb and wadouri image loader prefixes
  cornerstoneWADOImageLoader.internal.loadImage = loadImage;

}($, cornerstone, cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertRGB(imageFrame, rgbaBuffer) {
    if(imageFrame.planarConfiguration === 0) {
      cornerstoneWADOImageLoader.convertRGBColorByPixel(imageFrame.pixelData, rgbaBuffer);
    } else {
      cornerstoneWADOImageLoader.convertRGBColorByPlane(imageFrame.pixelData, rgbaBuffer);
    }
  }

  function convertYBRFull(imageFrame, rgbaBuffer) {
    if(imageFrame.planarConfiguration === 0) {
      cornerstoneWADOImageLoader.convertYBRFullByPixel(imageFrame.pixelData, rgbaBuffer);
    } else {
      cornerstoneWADOImageLoader.convertYBRFullByPlane(imageFrame.pixelData, rgbaBuffer);
    }
  }

  function convertColorSpace(imageFrame, imageData) {
    var rgbaBuffer = imageData.data;

    // convert based on the photometric interpretation
    var deferred = $.Deferred();
    try {
      if (imageFrame.photometricInterpretation === "RGB" )
      {
        convertRGB(imageFrame, rgbaBuffer);
      }
      else if (imageFrame.photometricInterpretation === "YBR_RCT")
      {
        convertRGB(imageFrame, rgbaBuffer);
      }
      else if (imageFrame.photometricInterpretation === "YBR_ICT")
      {
        convertRGB(imageFrame, rgbaBuffer);
      }
      else if( imageFrame.photometricInterpretation === "PALETTE COLOR" )
      {
        cornerstoneWADOImageLoader.convertPALETTECOLOR(imageFrame, rgbaBuffer);
      }
      else if( imageFrame.photometricInterpretation === "YBR_FULL_422" )
      {
        convertRGB(imageFrame, rgbaBuffer);
      }
      else if(imageFrame.photometricInterpretation === "YBR_FULL" )
      {
        convertYBRFull(imageFrame, rgbaBuffer);
      }
      else
      {
        throw "no color space conversion for photometric interpretation " + imageFrame.photometricInterpretation;
      }
      
      deferred.resolve(imageData);
      return deferred.promise();
    } catch (error) {
      deferred.reject(error);
      return deferred.promise();
    }
  }

  // module exports
  cornerstoneWADOImageLoader.convertColorSpace = convertColorSpace;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertPALETTECOLOR( imageFrame, rgbaBuffer ) {
    var numPixels = imageFrame.columns * imageFrame.rows;
    var palIndex=0;
    var rgbaIndex=0;
    var pixelData = imageFrame.pixelData;
    var start = imageFrame.palette.start;
    var rData = imageFrame.palette.rData;
    var gData = imageFrame.palette.gData;
    var bData = imageFrame.palette.bData;
    var shift = imageFrame.palette.bits ===8 ? 0 : 8;
    var len = imageFrame.palette.rData.length;

    for( var i=0 ; i < numPixels ; ++i ) {
      var value=pixelData[palIndex++];
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

  // module exports
  cornerstoneWADOImageLoader.convertRGBColorByPlane = convertRGBColorByPlane;
}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

    "use strict";

    function convertYBRFullByPixel(imageFrame, rgbaBuffer) {
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
    cornerstoneWADOImageLoader.convertYBRFullByPixel = convertYBRFullByPixel;
}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertYBRFullByPlane(imageFrame, rgbaBuffer) {
    if (imageFrame === undefined) {
      throw "decodeRGB: ybrBuffer must not be undefined";
    }
    if (imageFrame.length % 3 !== 0) {
      throw "decodeRGB: ybrBuffer length must be divisble by 3";
    }


    var numPixels = imageFrame.length / 3;
    var rgbaIndex = 0;
    var yIndex = 0;
    var cbIndex = numPixels;
    var crIndex = numPixels * 2;
    for (var i = 0; i < numPixels; i++) {
      var y = imageFrame[yIndex++];
      var cb = imageFrame[cbIndex++];
      var cr = imageFrame[crIndex++];
      rgbaBuffer[rgbaIndex++] = y + 1.40200 * (cr - 128);// red
      rgbaBuffer[rgbaIndex++] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
      rgbaBuffer[rgbaIndex++] = y + 1.77200 * (cb - 128); // blue
      rgbaBuffer[rgbaIndex++] = 255; //alpha
    }
  }
  // module exports
  cornerstoneWADOImageLoader.convertYBRFullByPlane = convertYBRFullByPlane;
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function configure(options) {
    cornerstoneWADOImageLoader.internal.options = options;
  }

  // module exports
  cornerstoneWADOImageLoader.configure = configure;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function createImageObject( dataSet, imageId, frame, sharedCacheKey ) {
    if(frame === undefined) {
      frame = 0;
    }

    // make the image based on whether it is color or not
    var photometricInterpretation = dataSet.string('x00280004');
    var isColor = cornerstoneWADOImageLoader.isColorImage(photometricInterpretation);
    if(isColor === false) {
      return cornerstoneWADOImageLoader.makeGrayscaleImage(imageId, dataSet, frame, sharedCacheKey);
    } else {
      return cornerstoneWADOImageLoader.makeColorImage(imageId, dataSet, frame, sharedCacheKey);
    }
  }

  // module exports
  cornerstoneWADOImageLoader.createImageObject = createImageObject;

}(cornerstoneWADOImageLoader));
/**
 * This object supports loading of DICOM P10 dataset from a uri and caching it so it can be accessed
 * by the caller.  This allows a caller to access the datasets without having to go through cornerstone's
 * image loader mechanism.  One reason a caller may need to do this is to determine the number of frames
 * in a multiframe sop instance so it can create the imageId's correctly.
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var loadedDataSets = {};
  var promises = {};

  // returns true if the wadouri for the specified index has been loaded
  function isLoaded(uri) {
    return loadedDataSets[uri] !== undefined;
  }

  // loads the dicom dataset from the wadouri sp
  function load(uri, loadRequest) {

    // if already loaded return it right away
    if(loadedDataSets[uri]) {
      //console.log('using loaded dataset ' + uri);
      var alreadyLoadedpromise = $.Deferred();
      loadedDataSets[uri].cacheCount++;
      alreadyLoadedpromise.resolve(loadedDataSets[uri].dataSet);
      return alreadyLoadedpromise;
    }

    // if we are currently loading this uri, return its promise
    if(promises[uri]) {
      //console.log('returning existing load promise for ' + uri);
      return promises[uri];
    }

    //console.log('loading ' + uri);

    // This uri is not loaded or being loaded, load it via an xhrRequest
    var promise = loadRequest(uri);
    promises[uri] = promise;

    // handle success and failure of the XHR request load
    promise.then(function(dataSet) {
      loadedDataSets[uri] = {
        dataSet: dataSet,
        cacheCount: 1
      };
      // done loading, remove the promise
      delete promises[uri];
    }, function () {
    }).always(function() {
        // error thrown, remove the promise
        delete promises[uri];
      });
    return promise;
  }

  // remove the cached/loaded dicom dataset for the specified wadouri to free up memory
  function unload(uri) {
    //console.log('unload for ' + uri);
    if(loadedDataSets[uri]) {
      loadedDataSets[uri].cacheCount--;
      if(loadedDataSets[uri].cacheCount === 0) {
        //console.log('removing loaded dataset for ' + uri);
        delete loadedDataSets[uri];
      }
    }
  }

  // removes all cached datasets from memory
  function purge() {
    loadedDataSets = {};
    promises = {};
  }

  // module exports
  cornerstoneWADOImageLoader.dataSetCacheManager = {
    isLoaded: isLoaded,
    load: load,
    unload: unload,
    purge: purge
  };

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  function swap16(val) {
    return ((val & 0xFF) << 8)
      | ((val >> 8) & 0xFF);
  }


  function decodeBigEndian(imageFrame) {
    if(imageFrame.bitsAllocated === 8) {
      return imageFrame;
    }
    else if(imageFrame.bitsAllocated === 16) {
      for(var i=0; i < imageFrame.pixelData.length; i++) {
        imageFrame[i] = swap16(imageFrame.pixelData[i]);
      }
      return imageFrame;
    }
    throw 'unsupported bits allocated for big endian transfer syntax';
  }

  // module exports
  cornerstoneWADOImageLoader.decodeBigEndian = decodeBigEndian;

}(cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeImageFrame(imageFrame) {
    
    var start = new Date().getTime();

    // Implicit VR Little Endian
    if( imageFrame.transferSyntax === "1.2.840.10008.1.2") {
      imageFrame = imageFrame;
    }
    // Explicit VR Little Endian
    else if( imageFrame.transferSyntax === "1.2.840.10008.1.2.1") {
      imageFrame = imageFrame;
    }
    // Explicit VR Big Endian (retired)
    else if ( imageFrame.transferSyntax === "1.2.840.10008.1.2.2" ) {
      imageFrame = cornerstoneWADOImageLoader.decodeBigEndian(imageFrame);
    }
    // Deflate transfer syntax (deflated by dicomParser)
    else if(imageFrame.transferSyntax === '1.2.840.10008.1.2.1.99') {
      imageFrame = imageFrame;
    }
    // RLE Lossless
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.5" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeRLE(imageFrame);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame);
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.51")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14)
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.57")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.70" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame);
    }
    // JPEG-LS Lossless Image Compression
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.80" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame);
    }
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.81" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame);
    }
     // JPEG 2000 Lossless
    else if(imageFrame.transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame);
    }
    // JPEG 2000 Lossy
    else if(imageFrame.transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame);
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
}($, cornerstone, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJpx(imageFrame) {

    var jpxImage = new JpxImage();
    jpxImage.parse(imageFrame.pixelData);

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
    var src32 = new Uint32Array(openJPEG.HEAP32.buffer, imagePtr, length);
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

  function decodeOpenJpeg2000(imageFrame) {
    var bytesPerPixel = imageFrame.bitsAllocated <= 8 ? 1 : 2;
    var signed = imageFrame.pixelRepresentation === 1;

    var image = decodeOpenJPEG(imageFrame.pixelData, bytesPerPixel, signed);

    imageFrame.columns = image.sx;
    imageFrame.rows = image.sy;
    imageFrame.pixelData = image.pixelData;
    return imageFrame;
  }

  function decodeJPEG2000(imageFrame)
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
      return decodeOpenJpeg2000(imageFrame);
    }

    // OHIF image-JPEG2000 https://github.com/OHIF/image-JPEG2000
    if(typeof JpxImage !== 'undefined') {
      return decodeJpx(imageFrame);
    }
  }

  cornerstoneWADOImageLoader.decodeJPEG2000 = decodeJPEG2000;
}($, cornerstone, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJPEGBaseline(imageFrame)
  {
    // check to make sure codec is loaded
    if(typeof JpegImage === 'undefined') {
      throw 'No JPEG Baseline decoder loaded';
    }
    var jpeg = new JpegImage();
    jpeg.parse( imageFrame.pixelData);
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

    var imageFrame = cornerstoneWADOImageLoader.getRawImageFrame(dataSet, frame);

    imageFrame = cornerstoneWADOImageLoader.getEncapsulatedImageFrame(dataSet, imageFrame, frame);
    //var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);
    var encodedImageFrame = imageFrame.pixelData;
    
    var imgBlob = new Blob([encodedImageFrame], {type: "image/jpeg"});

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
"use strict";
(function (cornerstoneWADOImageLoader) {

  function decodeJPEGLossless(imageFrame) {
    // check to make sure codec is loaded
    if(typeof jpeg === 'undefined' ||
      typeof jpeg.lossless === 'undefined' ||
      typeof jpeg.lossless.Decoder === 'undefined') {
      throw 'No JPEG Lossless decoder loaded';
    }

    var byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
    //console.time('jpeglossless');
    var buffer = imageFrame.pixelData.buffer;
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

  function decodeJPEGLS(imageFrame)
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

    var image = jpegLSDecode(imageFrame.pixelData, imageFrame.pixelRepresentation === 1);
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

  function decodeRLE(imageFrame) {

    if(imageFrame.bitsAllocated === 8) {
      return decode8(imageFrame);
    } else if( imageFrame.bitsAllocated === 16) {
      return decode16(imageFrame);
    } else {
      throw 'unsupported pixel format for RLE'
    }
  }

  function decode8(imageFrame ) {
    var frameData = imageFrame.pixelData;
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

  function decode16( imageFrame ) {
    var frameData = imageFrame.pixelData;
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
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeTransferSyntax(dataSet, frame) {
    var imageFrame = cornerstoneWADOImageLoader.getRawImageFrame(dataSet, frame);
    return cornerstoneWADOImageLoader.decodeImageFrame(imageFrame);
  }

  // module exports
  cornerstoneWADOImageLoader.decodeTransferSyntax = decodeTransferSyntax;

}(cornerstoneWADOImageLoader));
/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // new path....

  function framesAreFragmented(dataSet) {
    var numberOfFrames = dataSet.intString('x00280008');
    var pixelDataElement = dataSet.elements.x7fe00010;
    if(numberOfFrames != pixelDataElement.fragments.length) {
      return true;
    }
  }

  function getEncodedImageFrame(dataSet, frame) {
    // Empty basic offset table
    if(!dataSet.elements.x7fe00010.basicOffsetTable.length) {
      if(framesAreFragmented(dataSet)) {
        var basicOffsetTable = dicomParser.createJPEGBasicOffsetTable(dataSet, dataSet.elements.x7fe00010);
        return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frame, basicOffsetTable);
      } else {
        return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, dataSet.elements.x7fe00010, frame);
      }
    }

    // Basic Offset Table is not empty
    return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frame);
  }

  function getEncapsulatedImageFrame(dataSet, imageFrame, frameIndex) {
    imageFrame.pixelData = getEncodedImageFrame(dataSet, frameIndex);
    return imageFrame;
  }
  cornerstoneWADOImageLoader.getEncapsulatedImageFrame = getEncapsulatedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));
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
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getLUT(pixelRepresentation, lutDataSet) {
    // Make sure all required LUT entries are present
    if(!lutDataSet.elements.x00283002 ||
      !lutDataSet.elements.x00283002 ||
      !lutDataSet.elements.x00283006) {
      return;
    }

    // Parse the lut descriptor
    var numLUTEntries = lutDataSet.uint16('x00283002', 0);
    if(numLUTEntries === 0) {
      numLUTEntries = 65535;
    }
    var firstValueMapped;
    if(pixelRepresentation === 0) {
      firstValueMapped = lutDataSet.uint16('x00283002', 1);
    } else {
      firstValueMapped = lutDataSet.int16('x00283002', 1);
    }
    var numBitsPerEntry = lutDataSet.uint16('x00283002', 2);
    //console.log('LUT(', numLUTEntries, ',', firstValueMapped, ',', numBitsPerEntry, ')');

    // Validate the LUT descriptor
    if(numLUTEntries === undefined ||
      firstValueMapped === undefined ||
      numBitsPerEntry === undefined) {
      return;
    }

    // Create the LUT object
    var lut = {
      id : '1',
      firstValueMapped: firstValueMapped,
      numBitsPerEntry : numBitsPerEntry,
      lut : []
    };

    //console.log("minValue=", minValue, "; maxValue=", maxValue);
    for (var i = 0; i < numLUTEntries; i++) {
      if(pixelRepresentation === 0) {
        lut.lut[i] = lutDataSet.uint16('x00283006', i);
      } else {
        lut.lut[i] = lutDataSet.int16('x00283006', i);
      }
    }
    return lut;
  }
  // module exports
  cornerstoneWADOImageLoader.getLUT = getLUT;

}(cornerstoneWADOImageLoader));


(function (cornerstoneWADOImageLoader) {

  "use strict";

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

  // module exports
  cornerstoneWADOImageLoader.getMinMax = getMinMax;

}(cornerstoneWADOImageLoader));


(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getPaletteLength(dataSet) {
    var len=dataSet.int16('x00281101',0);

    // Account for zero-values for the lookup table length
    //
    // "The first Palette Color Lookup Table Descriptor value is the number of entries in the lookup table.
    //  When the number of table entries is equal to 2^16 then this value shall be 0."
    //
    // See: http://dicom.nema.org/MEDICAL/Dicom/2015c/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.5
    if (!len) {
      len = 65536;
    }

    return len;
  }


  function getPalette(dataSet) {

    // if no palette return undefined
    if(!dataSet.elements.x00281101 ||
      !dataSet.elements.x00281201 ||
      !dataSet.elements.x00281202 ||
      !dataSet.elements.x00281203) {
      return;
    }

    // Build the palette object
    var len = getPaletteLength(dataSet);

    var buffer = dataSet.byteArray.buffer;

    return {
      start: dataSet.int16('x00281101',1),
      bits: dataSet.int16('x00281101',2),
      rData : new Uint16Array(buffer, dataSet.elements.x00281201.dataOffset, len),
      gData : new Uint16Array(buffer, dataSet.elements.x00281202.dataOffset, len),
      bData : new Uint16Array(buffer, dataSet.elements.x00281203.dataOffset, len)
    };

  }
  // module exports
  cornerstoneWADOImageLoader.getPalette = getPalette;
}(cornerstoneWADOImageLoader));
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

    function getPixelSpacing(dataSet) {
      // NOTE - these are not required for all SOP Classes
      // so we return them as undefined.  We also do not
      // deal with the complexity associated with projection
      // radiographs here and leave that to a higher layer
      var pixelSpacing = dataSet.string('x00280030');
      if (pixelSpacing && pixelSpacing.length > 0) {
        var split = pixelSpacing.split('\\');

        // Make sure that neither pixel spacing value is 0 or undefined
        if (parseFloat(split[0]) && parseFloat(split[1])) {
          return {
            row: parseFloat(split[0]),
            column: parseFloat(split[1])
          };
        }
      }

      return {
        row: undefined,
        column: undefined
      };
    }
    // module exports
    cornerstoneWADOImageLoader.getPixelSpacing = getPixelSpacing;
}(cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function getRawImageFrame(dataSet, frameIndex) {
    var imageFrame = {
      transferSyntax : dataSet.string('x00020010'),
      samplesPerPixel : dataSet.uint16('x00280002'),
      photometricInterpretation : dataSet.string('x00280004'),
      planarConfiguration : dataSet.uint16('x00280006'),
      numberOfFrames : dataSet.intString('x00280008'),
      rows : dataSet.uint16('x00280010'),
      columns : dataSet.uint16('x00280011'),
      bitsAllocated : dataSet.uint16('x00280100'),
      pixelRepresentation : dataSet.uint16('x00280103'), // 0 = unsigned,
      palette: cornerstoneWADOImageLoader.getPalette(dataSet),
      pixelData: undefined
    };
    
    var pixelDataElement = dataSet.elements.x7fe00010;

    if(pixelDataElement.encapsulatedPixelData) {
      return cornerstoneWADOImageLoader.getEncapsulatedImageFrame(dataSet, imageFrame, frameIndex);
    } else {
      return cornerstoneWADOImageLoader.getUncompressedImageFrame(dataSet, imageFrame, pixelDataElement, frameIndex);
    }
  }

  cornerstoneWADOImageLoader.getRawImageFrame = getRawImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));
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

        if(dataSet.elements.x00281052 && dataSet.elements.x00281053) {
          result.intercept = dataSet.floatString('x00281052') || result.intercept;
          result.slope = dataSet.floatString('x00281053') || result.slope;
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

        if(dataSet.elements.x00281050 && dataSet.elements.x00281051) {
          result.windowCenter = dataSet.floatString('x00281050');
          result.windowWidth = dataSet.floatString('x00281051');
        }

        return result;
    }

    // module exports
    cornerstoneWADOImageLoader.getWindowWidthAndCenter = getWindowWidthAndCenter;
}(cornerstoneWADOImageLoader));

(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // register dicomfile image loader prefixes
  cornerstone.registerImageLoader('dicomfile', cornerstoneWADOImageLoader.internal.loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var files = [];

  function add(file) {
    var fileIndex =  files.push(file);
    return 'dicomfile:' + (fileIndex - 1);
  }

  function get(index) {
    return files[index];
  }

  function remove(index) {
    files[index] = undefined;
  }

  function purge() {
    files = [];
  }

  // module exports
  cornerstoneWADOImageLoader.fileManager = {
    add : add,
    get : get,
    remove:remove,
    purge: purge
  };

}(cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function loadFileRequest(uri) {

    var parsedImageId = cornerstoneWADOImageLoader.parseImageId(uri);
    var fileIndex = parseInt(parsedImageId.url);
    var file = cornerstoneWADOImageLoader.fileManager.get(fileIndex);
    
    // create a deferred object
    var deferred = $.Deferred();

    var fileReader = new FileReader();
    fileReader.onload = function (e) {
      // Parse the DICOM File
      var dicomPart10AsArrayBuffer = e.target.result;
      var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
      var dataSet = dicomParser.parseDicom(byteArray);

      deferred.resolve(dataSet);
    };
    fileReader.readAsArrayBuffer(file);

    return deferred.promise();
  }
  cornerstoneWADOImageLoader.internal.loadFileRequest = loadFileRequest;
}($, cornerstone, cornerstoneWADOImageLoader));

(function (cornerstoneWADOImageLoader) {

  function checkToken(token, data, dataOffset) {

    if(dataOffset + token.length > data.length) {
      //console.log('dataOffset >> ', dataOffset);
      return false;
    }

    var endIndex = dataOffset;

    for(var i = 0; i < token.length; i++) {
      if(token[i] !== data[endIndex++]) {
        if(endIndex > 520000) {
          //console.log('token=',uint8ArrayToString(token));
          //console.log('data=', uint8ArrayToString(data, dataOffset, endIndex-dataOffset));
          //console.log('miss at %d %s dataOffset=%d', i, String.fromCharCode(data[endIndex]), endIndex);
          //console.log('miss at %d %s dataOffset=%d', i, String.fromCharCode(token[endIndex]), endIndex);
        }
        return false;
      }
    }
    return true;
  }

  function stringToUint8Array(str) {
    var uint=new Uint8Array(str.length);
    for(var i=0,j=str.length;i<j;i++){
      uint[i]=str.charCodeAt(i);
    }
    return uint;
  }

  function findIndexOfString(data, str, offset) {

    offset = offset || 0;

    var token = stringToUint8Array(str);

    for(var i=offset; i < data.length; i++) {
      if(token[0] === data[i]) {
        //console.log('match @', i);
        if(checkToken(token, data, i)) {
          return i;
        }
      }
    }
    return -1;
  }
  cornerstoneWADOImageLoader.internal.findIndexOfString = findIndexOfString;

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function findBoundary(header) {
    for(var i=0; i < header.length; i++) {
      if(header[i].substr(0,2) === '--') {
        return header[i];
      }
    }
    return undefined;
  }

  function findContentType(header) {
    for(var i=0; i < header.length; i++) {
      if(header[i].substr(0,13) === 'Content-Type:') {
        return header[i].substr(13).trim();
      }
    }
    return undefined;
  }

  function uint8ArrayToString(data, offset, length) {
    offset = offset || 0;
    length = length || data.length - offset;
    var str = "";
    for(var i=offset; i < offset + length; i++) {
      str += String.fromCharCode(data[i]);
    }
    return str;
  };

  cornerstoneWADOImageLoader.internal.getImageFrame = function(uri, mediaType) {
    mediaType = mediaType || 'application/octet-stream';

    var deferred = $.Deferred();

    var xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";
    xhr.open("get", uri, true);
    xhr.setRequestHeader('Accept', 'multipart/related;type=' + mediaType);
    xhr.onreadystatechange = function (oEvent) {
      // TODO: consider sending out progress messages here as we receive the pixel data
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // request succeeded, Parse the multi-part mime response
          var imageFrameAsArrayBuffer = xhr.response;
          var response = new Uint8Array(xhr.response);
          // First look for the multipart mime header
          var tokenIndex = cornerstoneWADOImageLoader.internal.findIndexOfString(response, '\n\r\n');
          if(tokenIndex === -1) {
            deferred.reject('invalid response - no multipart mime header');
          }
          var header = uint8ArrayToString(response, 0, tokenIndex);
          // Now find the boundary  marker
          var split = header.split('\r\n');
          var boundary = findBoundary(split);
          if(!boundary) {
            deferred.reject('invalid response - no boundary marker')
          }
          var offset = tokenIndex + 4; // skip over the \n\r\n

          // find the terminal boundary marker
          var endIndex = cornerstoneWADOImageLoader.internal.findIndexOfString(response, boundary, offset);
          if(endIndex === -1) {
            deferred.reject('invalid response - terminating boundary not found');
          }
          // return the info for this pixel data
          var length = endIndex - offset - 1;
          deferred.resolve({
            contentType: findContentType(split),
            arrayBuffer: imageFrameAsArrayBuffer,
            offset: offset,
            length: length
          });
        }
        else {
          // request failed, reject the deferred
          deferred.reject(xhr.response);
        }
      }
    };
    xhr.send();

    return deferred.promise();
  };
}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var images = [];

  function add(image) {
    var fileIndex =  images.push(image);
    return 'wadors:' + (fileIndex - 1);
  }

  function get(index) {
    return images[index];
  }

  function remove(index) {
    images[index] = undefined;
  }

  function purge() {
    images = [];
  }

  // module exports
  cornerstoneWADOImageLoader.imageManager = {
    add : add,
    get : get,
    remove:remove,
    purge: purge
  };

}(cornerstoneWADOImageLoader));

(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function loadImage(imageId) {
    var deferred = $.Deferred();
    var index = imageId.substring(7);
    var image = cornerstoneWADOImageLoader.imageManager.get(index);
    if(image === undefined) {
      deferred.reject('unknown imageId');
      return deferred.promise();
    }

    var mediaType;// = 'image/dicom+jp2';

    cornerstoneWADOImageLoader.internal.getImageFrame(image.uri, mediaType).then(function(result) {
      //console.log(result);
      // TODO: add support for retrieving compressed pixel data
      var storedPixelData;
      if(image.instance.bitsAllocated === 16) {
        if(image.instance.pixelRepresentation === 0) {
          storedPixelData = new Uint16Array(result.arrayBuffer, result.offset, result.length / 2);
        } else {
          storedPixelData = new Int16Array(result.arrayBuffer, result.offset, result.length / 2);
        }
      } else if(image.instance.bitsAllocated === 8) {
        storedPixelData = new Uint8Array(result.arrayBuffer, result.offset, result.length);
      }

      // TODO: handle various color space conversions

      var minMax = cornerstoneWADOImageLoader.getMinMax(storedPixelData);
      image.imageId = imageId;
      image.minPixelValue = minMax.min;
      image.maxPixelValue = minMax.max;
      image.render = cornerstone.renderGrayscaleImage;
      image.getPixelData = function() {
        return storedPixelData;
      };
      //console.log(image);
      deferred.resolve(image);
    }).fail(function(reason) {
      deferred.reject(reason);
    });

    return deferred.promise();
  }

  // registery dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('wadors', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));

(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // register dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomweb', cornerstoneWADOImageLoader.internal.loadImage);
  cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.internal.loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));
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

        var imageFrame = cornerstoneWADOImageLoader.decodeTransferSyntax(dataSet, frame);

        // setup the canvas context
        canvas.height = imageFrame.rows;
        canvas.width = imageFrame.columns;

        var context = canvas.getContext('2d');
        var imageData = context.createImageData(imageFrame.columns, imageFrame.rows);
        return cornerstoneWADOImageLoader.convertColorSpace(imageFrame, imageData);
    }

    function makeColorImage(imageId, dataSet, frame, sharedCacheKey) {

        // extract the DICOM attributes we need
        var pixelSpacing = cornerstoneWADOImageLoader.getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept(dataSet);
        var bytesPerPixel = 4;
        var numPixels = rows * columns;
        //var sizeInBytes = numPixels * bytesPerPixel;
        var sizeInBytes = dataSet.byteArray.length;
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
          return deferred.promise();
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
                sizeInBytes: sizeInBytes,
                sharedCacheKey: sharedCacheKey
            };

          if(image.windowCenter === undefined || isNaN(image.windowCenter) ||
            image.windowWidth === undefined || isNaN(image.windowWidth)) {
                image.windowWidth = 255;
                image.windowCenter = 128;
            }

            // invoke the callback to allow external code to modify the newly created image object if needed - e.g.
            // apply vendor specific workarounds and such
            if(cornerstoneWADOImageLoader.internal.options.imageCreated) {
                cornerstoneWADOImageLoader.internal.options.imageCreated(image);
            }

            deferred.resolve(image);
        }, function(error) {
            deferred.reject(error);
        });

        return deferred.promise();
    }

    // module exports
    cornerstoneWADOImageLoader.makeColorImage = makeColorImage;
}($, cornerstone, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    function isModalityLUTForDisplay(dataSet) {
      // special case for XA and XRF
      // https://groups.google.com/forum/#!searchin/comp.protocols.dicom/Modality$20LUT$20XA/comp.protocols.dicom/UBxhOZ2anJ0/D0R_QP8V2wIJ
      var sopClassUid = dataSet.string('x00080016');
      return  sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.1' && // XA
              sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.2.1	'; // XRF
    }

    function makeGrayscaleImage(imageId, dataSet, frame, sharedCacheKey) {
        var deferred = $.Deferred();

        // extract the DICOM attributes we need
        var pixelSpacing = cornerstoneWADOImageLoader.getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept(dataSet);

        var sizeInBytes = dataSet.byteArray.length;
        var photometricInterpretation = dataSet.string('x00280004');
        var invert = (photometricInterpretation === "MONOCHROME1");
        var windowWidthAndCenter = cornerstoneWADOImageLoader.getWindowWidthAndCenter(dataSet);

        // Decompress and decode the pixel data for this image
        var storedPixelData;
        var imageFrame;
        try {
          imageFrame =  cornerstoneWADOImageLoader.decodeTransferSyntax(dataSet, frame);
          storedPixelData = imageFrame.pixelData;
        }
        catch(err) {
          deferred.reject(err);
          return deferred.promise();
        }

        var minMax = cornerstoneWADOImageLoader.getMinMax(storedPixelData);

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
            sizeInBytes: sizeInBytes,
            sharedCacheKey: sharedCacheKey,
            decodeTimeInMS : imageFrame.decodeTimeInMS
        };

        var pixelRepresentation = dataSet.uint16('x00280103');

        // modality LUT
        if(dataSet.elements.x00283000 && isModalityLUTForDisplay(dataSet)) {
          image.modalityLUT = cornerstoneWADOImageLoader.getLUT(pixelRepresentation, dataSet.elements.x00283000.items[0].dataSet);
        }

        // VOI LUT
        if(dataSet.elements.x00283010) {
          pixelRepresentation = 0;
          // if modality LUT can produce negative values, the data is signed
          if(image.minPixelValue * image.slope + image.intercept < 0) {
            pixelRepresentation = 1;
          }
          image.voiLUT = getLUT(pixelRepresentation, dataSet.elements.x00283010.items[0].dataSet);
        }

        // TODO: deal with pixel padding and all of the various issues by setting it to min pixel value (or lower)
        // TODO: Mask out overlays embedded in pixel data above high bit

        if(image.windowCenter === undefined || isNaN(image.windowCenter) ||
           image.windowWidth === undefined || isNaN(image.windowWidth)) {
            var maxVoi = image.maxPixelValue * image.slope + image.intercept;
            var minVoi = image.minPixelValue * image.slope + image.intercept;
            image.windowWidth = maxVoi - minVoi;
            image.windowCenter = (maxVoi + minVoi) / 2;
        }

        // invoke the callback to allow external code to modify the newly created image object if needed - e.g.
        // apply vendor specific workarounds and such
      if(cornerstoneWADOImageLoader.internal.options.imageCreated) {
        cornerstoneWADOImageLoader.internal.options.imageCreated(image);
      }
      
        deferred.resolve(image);
        return deferred.promise();
    }

    // module exports
    cornerstoneWADOImageLoader.makeGrayscaleImage = makeGrayscaleImage;
}($, cornerstone, cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";
  function parseImageId(imageId) {
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
    return {
      scheme: imageId.substr(0, firstColonIndex),
      url : url,
      frame: frame
    };
  }

  // module exports
  cornerstoneWADOImageLoader.parseImageId = parseImageId;
  
}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  // module exports
  cornerstoneWADOImageLoader.version = '0.13.3';

}(cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function xhrRequest(url, imageId) {

    var deferred = $.Deferred();

    // Make the request for the DICOM P10 SOP Instance
    var xhr = new XMLHttpRequest();
    xhr.open("get", url, true);
    xhr.responseType = "arraybuffer";
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

          deferred.resolve(dataSet);
        }
        else {
          // request failed, reject the deferred
          deferred.reject(xhr);
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

    return deferred.promise();
  }

  cornerstoneWADOImageLoader.internal.xhrRequest = xhrRequest;
}($, cornerstone, cornerstoneWADOImageLoader));
