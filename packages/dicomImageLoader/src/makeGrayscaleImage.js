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

    function getLUT(image, pixelRepresentation, lutDataSet) {
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

    function makeGrayscaleImage(imageId, dataSet, frame, sharedCacheKey) {
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
            return deferred.promise();
        }

        var numPixels = rows * columns;
        //var sizeInBytes = numPixels * bytesPerPixel;
        var sizeInBytes = dataSet.byteArray.length;
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
            sharedCacheKey: sharedCacheKey
        };

        // modality LUT
        var pixelRepresentation = dataSet.uint16('x00280103');
        if(dataSet.elements.x00283000) {
          image.modalityLUT = getLUT(image, pixelRepresentation, dataSet.elements.x00283000.items[0].dataSet);
        }

        // VOI LUT
        if(dataSet.elements.x00283010) {
          pixelRepresentation = 0;
          // if modality LUT can produce negative values, the data is signed
          if(image.minPixelValue * image.slope + image.intercept < 0) {
            pixelRepresentation = 1;
          }
          image.voiLUT = getLUT(image, pixelRepresentation, dataSet.elements.x00283010.items[0].dataSet);
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
        cornerstoneWADOImageLoader.internal.options.imageCreated(image);
      
        deferred.resolve(image);
        return deferred.promise();
    }

    // module exports
    cornerstoneWADOImageLoader.makeGrayscaleImage = makeGrayscaleImage;
}($, cornerstone, cornerstoneWADOImageLoader));