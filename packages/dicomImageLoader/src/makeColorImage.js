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