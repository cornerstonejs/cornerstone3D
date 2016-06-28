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