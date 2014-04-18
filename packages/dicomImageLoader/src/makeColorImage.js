var cornerstoneWADOImageLoader = (function (cornerstoneWADOImageLoader, colorImageDecoder) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

    var canvas = document.createElement('canvas');
    var lastImageIdDrawn = "";

    function extractStoredPixels(dataSet, byteArray, photometricInterpretation, width, height)
    {
        var pixelDataElement = dataSet.elements.x7fe00010;
        var pixelDataOffset = pixelDataElement.dataOffset;

        canvas.height = height;
        canvas.width = width;


        var encodedPixelData = new Uint8Array(byteArray.buffer, pixelDataOffset);
        if(photometricInterpretation === "RGB")
        {
            var context = canvas.getContext('2d');
            var imageData = context.createImageData(width, height);
            colorImageDecoder.decodeRGB(encodedPixelData, imageData.data);
            return imageData;
        }
    }

    function makeColorImage(imageId, dataSet, byteArray, photometricInterpretation) {

        // extract the DICOM attributes we need
        var pixelSpacing = cornerstoneWADOImageLoader.getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept(dataSet);
        var bytesPerPixel = 4;
        var numPixels = rows * columns;
        var sizeInBytes = numPixels * bytesPerPixel;
        var windowWidthAndCenter = cornerstoneWADOImageLoader.getWindowWidthAndCenter(dataSet);

        // Decompress and decode the pixel data for this image
        var imageData = extractStoredPixels(dataSet, byteArray, photometricInterpretation, columns, rows);

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
            image.windowWidth = 256;
            image.windowCenter = 127;
        }

        return image;
    }

    // module exports
    cornerstoneWADOImageLoader.makeColorImage = makeColorImage;

    return cornerstoneWADOImageLoader;
}(cornerstoneWADOImageLoader, colorImageDecoder));