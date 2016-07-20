/*! cornerstone-wado-image-loader - v0.14.0 - 2016-07-18 | (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */
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
    wadouri: {

    },
    wadors: {
      
    },
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
      var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(image.imageId);
      cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.unload(parsedImageId.url);
    };
  }

  function getPixelData(dataSet, frameIndex) {
    var pixelDataElement = dataSet.elements.x7fe00010;

    if(pixelDataElement.encapsulatedPixelData) {
      return cornerstoneWADOImageLoader.wadouri.getEncapsulatedImageFrame(dataSet, frameIndex);
    } else {
      return cornerstoneWADOImageLoader.wadouri.getUncompressedImageFrame(dataSet, frameIndex);
    }
  }

  function loadDataSetFromPromise(xhrRequestPromise, imageId, frame, sharedCacheKey) {
    var start = new Date().getTime();
    frame = frame || 0;
    var deferred = $.Deferred();
    xhrRequestPromise.then(function(dicomPart10AsArrayBuffer, xhr) {
      var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
      var dataSet = dicomParser.parseDicom(byteArray);
      var pixelData = getPixelData(dataSet, frame);
      var metaDataProvider = cornerstoneWADOImageLoader.wadouri.metaDataProvider;
      var transferSyntax =  dataSet.string('x00020010');
      var imagePromise = cornerstoneWADOImageLoader.createImage(imageId, pixelData, transferSyntax, metaDataProvider);
      imagePromise.then(function(image) {
        image.data = dataSet;
        var end = new Date().getTime();
        image.loadTimeInMS = end - start;
        addDecache(image);
        deferred.resolve(image);
      });
    }, function(error) {
      deferred.reject(error);
    });
    return deferred.promise();
  }

  function getLoaderForScheme(scheme) {
    if(scheme === 'dicomweb' || scheme === 'wadouri') {
      return cornerstoneWADOImageLoader.internal.xhrRequest;
    }
    else if(scheme === 'dicomfile') {
      return cornerstoneWADOImageLoader.wadouri.loadFileRequest;
    }
  }

  function loadImage(imageId) {

    var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(imageId);

    var loader = getLoaderForScheme(parsedImageId.scheme);

    // if the dataset for this url is already loaded, use it
    if(cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.isLoaded(parsedImageId.url)) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.load(parsedImageId.url, loader), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // load the dataSet via the dataSetCacheManager
    return loadDataSetFromPromise(cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.load(parsedImageId.url, loader), imageId, parsedImageId.frame, parsedImageId.url);
  }

  // register dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomweb', loadImage);
  cornerstone.registerImageLoader('wadouri', loadImage);
  cornerstone.registerImageLoader('dicomfile', loadImage);
}($, cornerstone, cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertPALETTECOLOR( imageFrame, rgbaBuffer ) {
    var numPixels = imageFrame.columns * imageFrame.rows;
    var palIndex=0;
    var rgbaIndex=0;
    var pixelData = imageFrame.pixelData;
    var start = imageFrame.redPaletteColorLookupTableDescriptor[1];
    var rData = imageFrame.redPaletteColorLookupTableData;
    var gData = imageFrame.greenPaletteColorLookupTableData;
    var bData = imageFrame.bluePaletteColorLookupTableData;
    var shift = imageFrame.redPaletteColorLookupTableDescriptor[2] === 8 ? 0 : 8;
    var len = imageFrame.redPaletteColorLookupTableData.length;
    if(len === 0) {
      len = 65535;
    }

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
    console.time('convertColorSpace');
    // convert based on the photometric interpretation
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
    console.timeEnd('convertColorSpace');
  }

  // module exports
  cornerstoneWADOImageLoader.convertColorSpace = convertColorSpace;

}(cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  var canvas = document.createElement('canvas');
  var lastImageIdDrawn = "";

  function isModalityLUTForDisplay(sopClassUid) {
    // special case for XA and XRF
    // https://groups.google.com/forum/#!searchin/comp.protocols.dicom/Modality$20LUT$20XA/comp.protocols.dicom/UBxhOZ2anJ0/D0R_QP8V2wIJ
    return  sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.1' && // XA
      sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.2.1	'; // XRF
  }

  function getSizeInBytes(imageFrame) {
    var bytesPerPixel = Math.round(imageFrame.bitsAllocated / 8);
    var sizeInBytes = imageFrame.rows * imageFrame.columns * bytesPerPixel * imageFrame.samplesPerPixel;
    return sizeInBytes;
  }

  function createImage(imageId, pixelData, transferSyntax, metaDataProvider) {
    var deferred = $.Deferred();
    var imageFrame = cornerstoneWADOImageLoader.getImageFrame(imageId, metaDataProvider);
    var decodePromise = cornerstoneWADOImageLoader.decodeImageFrame(imageFrame, transferSyntax, pixelData, canvas);
    decodePromise.then(function(imageFrame) {
      //var imagePixelModule = metaDataProvider('imagePixelModule', imageId);
      var imagePlaneModule = metaDataProvider('imagePlaneModule', imageId);
      var voiLutModule = metaDataProvider('voiLutModule', imageId);
      var modalityLutModule = metaDataProvider('modalityLutModule', imageId);
      var sopCommonModule = metaDataProvider('sopCommonModule', imageId);

      var image = {
        imageId: imageId,
        color: cornerstoneWADOImageLoader.isColorImage(imageFrame.photometricInterpretation),
        columnPixelSpacing: imagePlaneModule.pixelSpacing ? imagePlaneModule.pixelSpacing[1] : undefined,
        columns: imageFrame.columns,
        height: imageFrame.rows,
        intercept: modalityLutModule.rescaleIntercept ? modalityLutModule.rescaleIntercept: 0,
        invert: imageFrame.photometricInterpretation === "MONOCHROME1",
        minPixelValue : imageFrame.smallestPixelValue,
        maxPixelValue : imageFrame.largestPixelValue,
        render: undefined, // set below
        rowPixelSpacing: imagePlaneModule.pixelSpacing ? imagePlaneModule.pixelSpacing[0] : undefined,
        rows: imageFrame.rows,
        sizeInBytes: getSizeInBytes(imageFrame),
        slope: modalityLutModule.rescaleSlope ? modalityLutModule.rescaleSlope: 1,
        width: imageFrame.columns,
        windowCenter: voiLutModule.windowCenter ? voiLutModule.windowCenter[0] : undefined,
        windowWidth: voiLutModule.windowWidth ? voiLutModule.windowWidth[0] : undefined,
        decodeTimeInMS : imageFrame.decodeTimeInMS,
        webWorkerTimeInMS: imageFrame.webWorkerTimeInMS
      };


      // add function to return pixel data
      image.getPixelData = function() {
        return imageFrame.pixelData;
      };

      // convert color space
      if(image.color) {
        // setup the canvas context
        canvas.height = imageFrame.rows;
        canvas.width = imageFrame.columns;

        var context = canvas.getContext('2d');
        var imageData = context.createImageData(imageFrame.columns, imageFrame.rows);
        cornerstoneWADOImageLoader.convertColorSpace(imageFrame, imageData);
        imageFrame.imageData = imageData;
        imageFrame.pixelData = imageData.data;
      }

      // Setup the renderer
      if(image.color) {
        image.render = cornerstone.renderColorImage;
        image.getCanvas = function() {
          if(lastImageIdDrawn === imageId) {
            return canvas;
          }

          canvas.height = image.rows;
          canvas.width = image.columns;
          var context = canvas.getContext('2d');
          context.putImageData(imageFrame.imageData, 0, 0 );
          lastImageIdDrawn = imageId;
          return canvas;
        };

      } else {
        image.render = cornerstone.renderGrayscaleImage;
      }

      // calculate min/max if not supplied
      if(image.minPixelValue === undefined || image.maxPixelValue === undefined) {
        var minMax = cornerstoneWADOImageLoader.getMinMax(imageFrame.pixelData);
        image.minPixelValue = minMax.min;
        image.maxPixelValue = minMax.max;
      }

      // Modality LUT
      if(modalityLutModule.modalityLUTSequence &&
        modalityLutModule.modalityLUTSequence.length > 0 &&
        isModalityLUTForDisplay(sopCommonModule.sopClassUID)) {
        image.modalityLUT = modalityLutModule.modalityLUTSequence[0];
      }

      // VOI LUT
      if(voiLutModule.voiLUTSequence &&
        voiLutModule.voiLUTSequence.length > 0) {
        image.voiLUT  = voiLutModule.voiLUTSequence[0];
      }

      // set the ww/wc to cover the dynamic range of the image if no values are supplied
      if(image.windowCenter === undefined || image.windowWidth === undefined) {
        if(image.color) {
          image.windowWidth = 255;
          image.windowCenter = 128;
        } else {
          var maxVoi = image.maxPixelValue * image.slope + image.intercept;
          var minVoi = image.minPixelValue * image.slope + image.intercept;
          image.windowWidth = maxVoi - minVoi;
          image.windowCenter = (maxVoi + minVoi) / 2;
        }
      }
      deferred.resolve(image);
    });
    return deferred.promise();
  }

  cornerstoneWADOImageLoader.createImage = createImage;
}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeImageFrame(imageFrame, transferSyntax, pixelData, canvas) {
    // Implicit VR Little Endian
    if(transferSyntax === "1.2.840.10008.1.2") {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // Explicit VR Little Endian
    else if(transferSyntax === "1.2.840.10008.1.2.1") {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // Explicit VR Big Endian (retired)
    else if (transferSyntax === "1.2.840.10008.1.2.2" ) {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // Deflate transfer syntax (deflated by dicomParser)
    else if(transferSyntax === '1.2.840.10008.1.2.1.99') {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // RLE Lossless
    else if (transferSyntax === "1.2.840.10008.1.2.5" )
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if (transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      if(imageFrame.bitsAllocated === 8)
      {
        return cornerstoneWADOImageLoader.decodeJPEGBaseline8Bit(imageFrame, canvas);
      } else {
        return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
      }
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if (transferSyntax === "1.2.840.10008.1.2.4.51")
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14)
    else if (transferSyntax === "1.2.840.10008.1.2.4.57")
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    else if (transferSyntax === "1.2.840.10008.1.2.4.70" )
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // JPEG-LS Lossless Image Compression
    else if (transferSyntax === "1.2.840.10008.1.2.4.80" )
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    else if (transferSyntax === "1.2.840.10008.1.2.4.81" )
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
     // JPEG 2000 Lossless
    else if (transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
    }
    // JPEG 2000 Lossy
    else if (transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      return cornerstoneWADOImageLoader.webWorkerManager.addTask(imageFrame, transferSyntax, pixelData);
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

    var deferred = $.Deferred();
    deferred.resolve(imageFrame);
    return deferred.promise();
  }

  cornerstoneWADOImageLoader.decodeImageFrame = decodeImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getImageFrame(imageId, metaDataProvider) {
    var imagePixelModule = metaDataProvider('imagePixelModule', imageId);

    var imageFrame = {
      samplesPerPixel : imagePixelModule.samplesPerPixel,
      photometricInterpretation : imagePixelModule.photometricInterpretation,
      planarConfiguration : imagePixelModule.planarConfiguration,
      rows : imagePixelModule.rows,
      columns : imagePixelModule.columns,
      bitsAllocated : imagePixelModule.bitsAllocated,
      pixelRepresentation : imagePixelModule.pixelRepresentation, // 0 = unsigned,
      smallestPixelValue: imagePixelModule.smallestPixelValue,
      largestPixelValue: imagePixelModule.largestPixelValue,
      redPaletteColorLookupTableDescriptor : imagePixelModule.redPaletteColorLookupTableDescriptor,
      greenPaletteColorLookupTableDescriptor : imagePixelModule.greenPaletteColorLookupTableDescriptor,
      bluePaletteColorLookupTableDescriptor : imagePixelModule.bluePaletteColorLookupTableDescriptor,
      redPaletteColorLookupTableData : imagePixelModule.redPaletteColorLookupTableData,
      greenPaletteColorLookupTableData : imagePixelModule.greenPaletteColorLookupTableData,
      bluePaletteColorLookupTableData : imagePixelModule.bluePaletteColorLookupTableData,
      pixelData: undefined // populated later after decoding
    };

    return imageFrame;
  }

  cornerstoneWADOImageLoader.getImageFrame = getImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));
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
(function (cornerstoneWADOImageLoader) {

  "use strict";

  // module exports
  cornerstoneWADOImageLoader.version = '0.13.3';

}(cornerstoneWADOImageLoader));
(function (cornerstoneWADOImageLoader) {

  function checkToken(token, data, dataOffset) {

    if(dataOffset + token.length > data.length) {
      return false;
    }

    var endIndex = dataOffset;

    for(var i = 0; i < token.length; i++) {
      if(token[i] !== data[endIndex++]) {
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
  cornerstoneWADOImageLoader.wadors.findIndexOfString = findIndexOfString;

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

  cornerstoneWADOImageLoader.wadors.getPixelData = function(uri, imageId, mediaType) {
    mediaType = mediaType || 'application/octet-stream';
    var headers = {
      accept : mediaType
    };

    var deferred = $.Deferred();

    var loadPromise = cornerstoneWADOImageLoader.internal.xhrRequest(uri, imageId, headers);
    loadPromise.then(function(imageFrameAsArrayBuffer, xhr) {

      // request succeeded, Parse the multi-part mime response
      var response = new Uint8Array(imageFrameAsArrayBuffer);

      // First look for the multipart mime header
      var tokenIndex = cornerstoneWADOImageLoader.wadors.findIndexOfString(response, '\n\r\n');
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
      var offset = tokenIndex + 3; // skip over the \n\r\n

      // find the terminal boundary marker
      var endIndex = cornerstoneWADOImageLoader.wadors.findIndexOfString(response, boundary, offset);
      if(endIndex === -1) {
        deferred.reject('invalid response - terminating boundary not found');
      }
      // return the info for this pixel data
      var length = endIndex - offset;
      deferred.resolve({
        contentType: findContentType(split),
        imageFrame: new Uint8Array(imageFrameAsArrayBuffer, offset, length)
      });
    });
    return deferred.promise();    

  };
}(cornerstoneWADOImageLoader));

(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getTransferSyntaxForContentType(contentType) {
    return '1.2.840.10008.1.2'; // hard code to ILE for now
  }

  function loadImage(imageId) {
    var start = new Date().getTime();

    var deferred = $.Deferred();
    
    var uri = imageId.substring(7);
    
    // check to make sure we have metadata for this imageId
    var metaData = cornerstoneWADOImageLoader.wadors.metaDataManager.get(imageId);
    if(metaData === undefined) {
      deferred.reject('no metadata for imageId ' + imageId);
      return deferred.promise();
    }

    // TODO: load bulk data items that we might need

    var mediaType;// = 'image/dicom+jp2';

    // get the pixel data from the server
    cornerstoneWADOImageLoader.wadors.getPixelData(uri, imageId, mediaType).then(function(result) {

      var metaDataProvider = cornerstoneWADOImageLoader.wadors.metaDataProvider;
      var transferSyntax = getTransferSyntaxForContentType(result.contentType);
      var pixelData = result.imageFrame;
      var imagePromise = cornerstoneWADOImageLoader.createImage(imageId, pixelData, transferSyntax, metaDataProvider);
      imagePromise.then(function(image) {
        // add the loadTimeInMS property
        var end = new Date().getTime();
        image.loadTimeInMS = end - start;
        deferred.resolve(image);
      })
    }).fail(function(reason) {
      deferred.reject(reason);
    });

    return deferred.promise();
  }

  // register wadors scheme
  cornerstone.registerImageLoader('wadors', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  /**
   * Returns the first string value as a Javascript number
   *
   * @param element - The javascript object for the specified element in the metadata
   * @param [index] - the index of the value in a multi-valued element, default is 0
   * @param [defaultValue] - The default value to return if the element does not exist
   * @returns {*}
   */
  function getNumberString(element, index, defaultValue) {
    var value = cornerstoneWADOImageLoader.wadors.getValue(element, index, defaultValue);
    if(value === undefined) {
      return;
    }
    return parseFloat(value);
  }

  cornerstoneWADOImageLoader.wadors.getNumberString = getNumberString;
}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getNumberValue(element, index) {
    var value = cornerstoneWADOImageLoader.wadors.getValue(element, index);
    if(value === undefined) {
      return;
    }
    return parseFloat(value);
  }


  // module exports
  cornerstoneWADOImageLoader.wadors.getNumberValue = getNumberValue

}(cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  /**
   * Returns the values as an array of javascript numbers
   *
   * @param element - The javascript object for the specified element in the metadata
   * @param [minimumLength] - the minimum number of values
   * @returns {*}
   */
  function getNumberValues(element, minimumLength) {
    if (!element) {
      return;
    }
    // Value is not present if the attribute has a zero length value
    if (!element.Value) {
      return;
    }
    // make sure we have the expected length
    if (minimumLength && element.Value.length < minimumLength) {
      return;
    }

    var values = [];
    for(var i=0; i < element.Value.length; i++) {
      values.push(parseFloat(element.Value[i]));
    }
    return values;
  }

  cornerstoneWADOImageLoader.wadors.getNumberValues = getNumberValues;
}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  /**
   * Returns the raw value
   *
   * @param element - The javascript object for the specified element in the metadata
   * @param [index] - the index of the value in a multi-valued element, default is 0
   * @param [defaultValue] - The default value to return if the element does not exist
   * @returns {*}
   */
  function getValue(element, index, defaultValue) {
    index = index || 0;
    if (!element) {
      return defaultValue;
    }
    // Value is not present if the attribute has a zero length value
    if (!element.Value) {
      return defaultValue;
    }
    // make sure we have the specified index
    if (element.Value.length <= index ) {
      return defaultValue;
    }
    return element.Value[index];
  }

  cornerstoneWADOImageLoader.wadors.getValue = getValue;
}($, cornerstone, cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var getNumberValues = cornerstoneWADOImageLoader.wadors.getNumberValues;
  var getValue = cornerstoneWADOImageLoader.wadors.getValue;
  var getNumberValue = cornerstoneWADOImageLoader.wadors.getNumberValue;

  function metaDataProvider(type, imageId) {
    var metaData = cornerstoneWADOImageLoader.wadors.metaDataManager.get(imageId);
    if(!metaData) {
      return;
    }

    if (type === 'imagePlaneModule') {
      return {
        pixelSpacing: getNumberValues(metaData['00280030'], 2),
        imageOrientationPatient: getNumberValues(metaData['00200037'], 6),
        imagePositionPatient: getNumberValues(metaData['00200032'], 3),
        sliceThickness: getNumberValue(metaData['00180050']),
        sliceLocation: getNumberValue(metaData['00201041'])
      };
    }

    if (type === 'imagePixelModule') {
      return {
        samplesPerPixel: getValue(metaData['00280002']),
        photometricInterpretation: getValue(metaData['00280004']),
        rows: getValue(metaData['00280010']),
        columns: getValue(metaData['00280011']),
        bitsAllocated: getValue(metaData['00280100']),
        bitsStored: getValue(metaData['00280101']),
        highBit: getValue(metaData['00280102']),
        pixelRepresentation: getValue(metaData['00280103']),
        planarConfiguration: getValue(metaData['00280006']),
        pixelAspectRatio: getValue(metaData['00280034']),
        smallestPixelValue: getValue(metaData['00280106']),
        largestPixelValue: getValue(metaData['00280107']),
        // TODO Color Palette
      };
    }

    if (type === 'voiLutModule') {
      return {
        // TODO VOT LUT Sequence
        windowCenter : getNumberValues(metaData['00281050'], 1),
        windowWidth : getNumberValues(metaData['00281051'], 1),
      };
    }

    if (type === 'modalityLutModule') {
      return {
        // TODO VOT LUT Sequence
        rescaleIntercept : getNumberValue(metaData['00281052']),
        rescaleSlope : getNumberValue(metaData['00281053']),
        rescaleType: getValue(metaData['00281054'])
      };
    }

    if (type === 'sopCommonModule') {
      return {
        sopClassUID : getValue(metaData['00080016']),
        sopInstanceUID : getValue(metaData['00080018']),
      };
    }

  }

  // module exports
  cornerstoneWADOImageLoader.wadors.metaDataProvider = metaDataProvider

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var imageIds = [];

  function add(imageId, metadata) {
    imageIds[imageId] = metadata;
  }

  function get(imageId) {
    return imageIds[imageId];
  }

  function remove(imageId) {
    imageIds[imageId] = undefined;
  }

  function purge() {
    imageIds = [];
  }

  // module exports
  cornerstoneWADOImageLoader.wadors.metaDataManager = {
    add : add,
    get : get,
    remove:remove,
    purge: purge
  };

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

  function get(uri) {

    // if already loaded return it right away
    if(!loadedDataSets[uri]) {
      return;
    }

    return loadedDataSets[uri].dataSet;
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
    promise.then(function(dicomPart10AsArrayBuffer, xhr) {
      var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
      var dataSet = dicomParser.parseDicom(byteArray);

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
  cornerstoneWADOImageLoader.wadouri.dataSetCacheManager = {
    isLoaded: isLoaded,
    load: load,
    unload: unload,
    purge: purge,
    get: get
  };

}(cornerstoneWADOImageLoader));
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
  cornerstoneWADOImageLoader.wadouri.fileManager = {
    add : add,
    get : get,
    remove:remove,
    purge: purge
  };

}(cornerstoneWADOImageLoader));
/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

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

  function getEncapsulatedImageFrame(dataSet, frameIndex) {
    return getEncodedImageFrame(dataSet, frameIndex);
  }
  cornerstoneWADOImageLoader.wadouri.getEncapsulatedImageFrame = getEncapsulatedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));
/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getUncompressedImageFrame(dataSet, frameIndex) {
    var pixelDataElement = dataSet.elements.x7fe00010;
    var bitsAllocated = dataSet.uint16('x00280100');
    var rows = dataSet.uint16('x00280010');
    var columns = dataSet.uint16('x00280011');
    var samplesPerPixel = dataSet.uint16('x00280002');

    var pixelDataOffset = pixelDataElement.dataOffset;
    var pixelsPerFrame = rows * columns * samplesPerPixel;

    if(bitsAllocated === 8) {
      var frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      return new Uint8Array(dataSet.byteArray.buffer, frameOffset, pixelsPerFrame);
    }
    else if(bitsAllocated === 16) {
      var frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * 2;
      if(frameOffset >= dataSet.byteArray.length) {
        throw 'frame exceeds size of pixelData';
      }
      return new Uint8Array(dataSet.byteArray.buffer, frameOffset,pixelsPerFrame * 2);
    }

    throw 'unsupported pixel format';
  }

  cornerstoneWADOImageLoader.wadouri.getUncompressedImageFrame = getUncompressedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function loadFileRequest(uri) {

    var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(uri);
    var fileIndex = parseInt(parsedImageId.url);
    var file = cornerstoneWADOImageLoader.wadouri.fileManager.get(fileIndex);
    
    // create a deferred object
    var deferred = $.Deferred();

    var fileReader = new FileReader();
    fileReader.onload = function (e) {
      var dicomPart10AsArrayBuffer = e.target.result;
      deferred.resolve(dicomPart10AsArrayBuffer);
    };
    fileReader.readAsArrayBuffer(file);

    return deferred.promise();
  }
  cornerstoneWADOImageLoader.wadouri.loadFileRequest = loadFileRequest;
}($, cornerstone, cornerstoneWADOImageLoader));

/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getLutDescriptor(dataSet, tag) {
    if(!dataSet.elements[tag] || dataSet.elements[tag].length != 6) {
      return;
    }
    return [dataSet.uint16(tag, 0),dataSet.uint16(tag, 1), dataSet.uint16(tag, 2)]
  }

  function getLutData(lutDataSet, tag, lutDescriptor) {
    var lut = [];
    var lutData = lutDataSet.elements[tag];
    var numLutEntries = lutDescriptor[0];
    for (var i = 0; i < numLutEntries; i++) {
      // Output range is always unsigned
      if(lutDescriptor[2] === 16) {
        lut[i] = lutDataSet.uint16(tag, i);
      }
      else {
        lut[i] = lutDataSet.byteArray[i + lutData.dataOffset];
      }
    }
    return lut;
  }

  function populatePaletteColorLut(dataSet, imagePixelModule) {
    // return immediately if no palette lut elements
    if(!dataSet.elements['x00281101']) {
      return;
    }
    imagePixelModule.redPaletteColorLookupTableDescriptor =  getLutDescriptor(dataSet, 'x00281101');
    imagePixelModule.greenPaletteColorLookupTableDescriptor =  getLutDescriptor(dataSet, 'x00281102');
    imagePixelModule.bluePaletteColorLookupTableDescriptor =  getLutDescriptor(dataSet, 'x00281103');

    imagePixelModule.redPaletteColorLookupTableData =  getLutData(dataSet, 'x00281201', imagePixelModule.redPaletteColorLookupTableDescriptor);
    imagePixelModule.greenPaletteColorLookupTableData = getLutData(dataSet, 'x00281202', imagePixelModule.greenPaletteColorLookupTableDescriptor);
    imagePixelModule.bluePaletteColorLookupTableData = getLutData(dataSet, 'x00281203', imagePixelModule.bluePaletteColorLookupTableDescriptor);
  }

  function populateSmallestLargestPixelValues(dataSet, imagePixelModule) {
    var pixelRepresentation = dataSet.uint16('x00280103');
    if(pixelRepresentation === 0) {
      imagePixelModule.smallestPixelValue = dataSet.uint16('x00280106');
      imagePixelModule.largestPixelValue = dataSet.uint16('x00280107');
    } else {
      imagePixelModule.smallestPixelValue = dataSet.int16('x00280106');
      imagePixelModule.largestPixelValue = dataSet.int16('x00280107');
    }
  }

  function getImagePixelModule(dataSet) {

    var imagePixelModule = {
      samplesPerPixel: dataSet.uint16('x00280002'),
      photometricInterpretation: dataSet.string('x00280004'),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
      bitsAllocated: dataSet.uint16('x00280100'),
      bitsStored: dataSet.uint16('x00280101'),
      highBit: dataSet.uint16('x00280102'),
      pixelRepresentation: dataSet.uint16('x00280103'),
      planarConfiguration: dataSet.uint16('x00280006'),
      pixelAspectRatio: dataSet.string('x00280034'),
    };
    populateSmallestLargestPixelValues(dataSet, imagePixelModule);
    populatePaletteColorLut(dataSet, imagePixelModule);
    return imagePixelModule;

  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.getImagePixelModule = getImagePixelModule

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getLUT(pixelRepresentation, lutDataSet) {
    var numLUTEntries = lutDataSet.uint16('x00283002', 0);
    if(numLUTEntries === 0) {
      numLUTEntries = 65535;
    }
    var firstValueMapped = 0;
    if(pixelRepresentation === 0) {
      firstValueMapped = lutDataSet.uint16('x00283002', 1);
    } else {
      firstValueMapped = lutDataSet.int16('x00283002', 1);
    }
    var numBitsPerEntry = lutDataSet.uint16('x00283002', 2);
    //console.log('LUT(', numLUTEntries, ',', firstValueMapped, ',', numBitsPerEntry, ')');
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


  function getLUTs(pixelRepresentation, lutSequence) {
    if(!lutSequence || !lutSequence.items.length) {
      return;
    }
    var luts = [];
    for(var i=0; i < lutSequence.items.length; i++) {
      var lutDataSet = lutSequence.items[i].dataSet;
      var lut = getLUT(pixelRepresentation, lutDataSet);
      if(lut) {
        luts.push(lut);
      }
    }
    return luts;
  }


  // module exports
  cornerstoneWADOImageLoader.wadouri.getLUTs = getLUTs

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getMinStoredPixelValue(dataSet) {
    var pixelRepresentation = dataSet.uint16('x00280103');
    var bitsStored = dataSet.uint16('x00280101');
    if(pixelRepresentation === 0) {
      return 0;
    }
    return -1 << (bitsStored -1);
  }

  // 0 = unsigned / US, 1 = signed / SS
  function getModalityLUTOutputPixelRepresentation(dataSet) {

    // CT SOP Classes are always signed
    var sopClassUID = dataSet.string('x00080016');
    if(sopClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
      sopClassUID === '1.2.840.10008.5.1.4.1.1.2.1') {
      return 1;
    }

    // if rescale intercept and rescale slope are present, pass the minimum stored
    // pixel value through them to see if we get a signed output range
    var rescaleIntercept = dataSet.floatString('x00281052');
    var rescaleSlope = dataSet.floatString('x00281053');
    if(rescaleIntercept !== undefined && rescaleSlope !== undefined) {
      var minStoredPixelValue = getMinStoredPixelValue(dataSet); //
      var minModalityLutValue = minStoredPixelValue * rescaleSlope + rescaleIntercept;
      if (minModalityLutValue < 0) {
        return 1;
      } else {
        return 0;
      }
    }

    // Output of non linear modality lut is always unsigned
    if(dataSet.elements.x00283000 && dataSet.elements.x00283000.length > 0) {
      return 0;
    }

    // If no modality lut transform, output is same as pixel representation
    var pixelRepresentation = dataSet.uint16('x00280103');
    return pixelRepresentation;
  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.getModalityLUTOutputPixelRepresentation = getModalityLUTOutputPixelRepresentation

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getNumberValues(dataSet, tag, minimumLength) {
    var values = [];
    var valueAsString = dataSet.string(tag);
    if(!valueAsString) {
      return;
    }
    var split = valueAsString.split('\\');
    if(minimumLength && split.length < minimumLength) {
      return;
    }
    for(var i=0;i < split.length; i++) {
      values.push(parseFloat(split[i]));
    }
    return values;
  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.getNumberValues = getNumberValues

}(cornerstoneWADOImageLoader));
/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var getNumberValues = cornerstoneWADOImageLoader.wadouri.getNumberValues;

  function metaDataProvider(type, imageId) {
    var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(imageId);

    var dataSet = cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.get(parsedImageId.url);
    if(!dataSet) {
      return;
    }

    if (type === 'imagePlaneModule') {
      return {
        pixelSpacing: getNumberValues(dataSet, 'x00280030', 2),
        imageOrientationPatient: getNumberValues(dataSet, 'x00200037', 6),
        imagePositionPatient: getNumberValues(dataSet, 'x00200032', 3),
        sliceThickness: dataSet.floatString('x00180050'),
        sliceLocation: dataSet.floatString('x00201041')
      };
    }

    if (type === 'imagePixelModule') {
      return cornerstoneWADOImageLoader.wadouri.getImagePixelModule(dataSet);
    }

    if (type === 'modalityLutModule') {
      return {
        rescaleIntercept : dataSet.floatString('x00281052'),
        rescaleSlope : dataSet.floatString('x00281053'),
        rescaleType: dataSet.string('x00281054'),
        modalityLUTSequence : cornerstoneWADOImageLoader.wadouri.getLUTs(dataSet.uint16('x00280103'), dataSet.elements.x00283000)
      };
    }

    if (type === 'voiLutModule') {
      var modalityLUTOutputPixelRepresentation = cornerstoneWADOImageLoader.wadouri.getModalityLUTOutputPixelRepresentation(dataSet);
      return {
        windowCenter : getNumberValues(dataSet, 'x00281050', 1),
        windowWidth : getNumberValues(dataSet, 'x00281051', 1),
        voiLUTSequence : cornerstoneWADOImageLoader.wadouri.getLUTs(modalityLUTOutputPixelRepresentation, dataSet.elements.x00283010)
      };
    }

    if (type === 'sopCommonModule') {
      return {
        sopClassUID : dataSet.string('x00080016'),
        sopInstanceUID : dataSet.string('x00080018'),
      };
    }

  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.metaDataProvider = metaDataProvider

}(cornerstoneWADOImageLoader));
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
  cornerstoneWADOImageLoader.wadouri.parseImageId = parseImageId;
  
}(cornerstoneWADOImageLoader));
(function ($, cornerstoneWADOImageLoader) {

  "use strict";

  var decodeTasks = [];

  var webWorkers = [];

  var config = {
    maxWebWorkers: 1,
    webWorkerPath : '../../dist/cornerstoneWADOImageLoaderWebWorker.js',
    codecsPath: '../dist/cornerstoneWADOImageLoaderCodecs.js'
  };

  var statistics = {
    numDecodeTasksCompleted: 0,
    totalDecodeTimeInMS: 0,
    totalTimeDelayedInMS: 0,
  };

  function startTaskOnWebWorker() {
    if(!decodeTasks.length) {
      return;
    }
    
    for(var i=0; i < webWorkers.length; i++) {
       {
        if(webWorkers[i].status === 'ready') {
          webWorkers[i].status = 'busy';

          var decodeTask = decodeTasks.shift();

          decodeTask.start = new Date().getTime();

          var end = new Date().getTime();
          var delayed = end - decodeTask.added;
          statistics.totalTimeDelayedInMS += delayed;

          webWorkers[i].decodeTask = decodeTask;
          webWorkers[i].worker.postMessage({
            message: 'decodeTask',
            workerIndex: i,
            decodeTask: {
              imageFrame : decodeTask.imageFrame,
              transferSyntax : decodeTask.transferSyntax,
              pixelData: decodeTask.pixelData,
            }
          });
          return;
        }
      }
    }
  }

  function setPixelDataType(imageFrame) {
    if(imageFrame.bitsAllocated === 16) {
      if(imageFrame.pixelRepresentation === 0) {
        imageFrame.pixelData = new Uint16Array(imageFrame.pixelData);
      } else {
        imageFrame.pixelData = new Int16Array(imageFrame.pixelData);
      }
    } else {
      imageFrame.pixelData = new Uint8Array(imageFrame.pixelData);
    }
  }

  function handleMessageFromWorker(msg) {
    //console.log('handleMessageFromWorker', msg.data);
    if(msg.data.message === 'initializeTaskCompleted') {
      webWorkers[msg.data.workerIndex].status = 'ready';
      startTaskOnWebWorker();
    } else if(msg.data.message === 'decodeTaskCompleted') {
      webWorkers[msg.data.workerIndex].status = 'ready';
      setPixelDataType(msg.data.imageFrame);

      statistics.numDecodeTasksCompleted++;
      statistics.totalDecodeTimeInMS += msg.data.imageFrame.decodeTimeInMS;

      var end = new Date().getTime();
      msg.data.imageFrame.webWorkerTimeInMS = end - webWorkers[msg.data.workerIndex].decodeTask.start;

      webWorkers[msg.data.workerIndex].decodeTask.deferred.resolve(msg.data.imageFrame);
      webWorkers[msg.data.workerIndex].decodeTask = undefined;
      startTaskOnWebWorker();
    }
  }

  function initialize(configObject) {
    if(configObject) {
      config = configObject;
    }

    for(var i=0; i < config.maxWebWorkers; i++) {
      var worker = new Worker(config.webWorkerPath);
      webWorkers.push({
        worker: worker,
        status: 'initializing'
      });
      worker.addEventListener('message', handleMessageFromWorker);
      worker.postMessage({
        message: 'initializeTask',
        workerIndex: webWorkers.length - 1,
        config: config
      });
    }
  }

  function addTask(imageFrame, transferSyntax, pixelData) {
    var deferred = $.Deferred();
    decodeTasks.push({
      status: 'ready',
      added : new Date().getTime(),
      imageFrame : imageFrame,
      transferSyntax : transferSyntax,
      pixelData: pixelData,
      deferred: deferred
    });

    startTaskOnWebWorker();

    return deferred.promise();
  }

  function getStatistics() {
    return statistics;
  }

  initialize();
  
  // module exports
  cornerstoneWADOImageLoader.webWorkerManager = {
    initialize : initialize,
    addTask : addTask,
    getStatistics: getStatistics
  };

}($, cornerstoneWADOImageLoader));
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function xhrRequest(url, imageId, headers) {
    headers = headers || {};
    
    var deferred = $.Deferred();

    // Make the request for the DICOM P10 SOP Instance
    var xhr = new XMLHttpRequest();
    xhr.open("get", url, true);
    xhr.responseType = "arraybuffer";
    cornerstoneWADOImageLoader.internal.options.beforeSend(xhr);
    Object.keys(headers).forEach(function (key) {
      xhr.setRequestHeader(key, headers[key]);
    });
    
    // handle response data
    xhr.onreadystatechange = function (oEvent) {
      // TODO: consider sending out progress messages here as we receive the pixel data
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          deferred.resolve(xhr.response, xhr);
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
