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