var cornerstoneWADOImageLoader = (function (cornerstoneWADOImageLoader) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

    var canvas = document.createElement('canvas');
    var lastImageIdDrawn = "";

    function extractStoredPixels(dataSet, byteArray, photometricInterpretation, width, height, frame) {
        canvas.height = height;
        canvas.width = width;

        var pixelDataElement = dataSet.elements.x7fe00010;
        var pixelDataOffset = pixelDataElement.dataOffset;
        var transferSyntax = dataSet.string('x00020010');

        var frameSize = width * height * 3;
        var frameOffset = pixelDataOffset + frame * frameSize;
        var encodedPixelData = new Uint8Array(byteArray.buffer, frameOffset);
        var context = canvas.getContext('2d');
        var imageData = context.createImageData(width, height);

        if (photometricInterpretation === "RGB") {
            cornerstoneWADOImageLoader.decodeRGB(encodedPixelData, imageData.data);
            return imageData;
        }
        else if (photometricInterpretation === "YBR_FULL")
        {
            cornerstoneWADOImageLoader.decodeYBRFull(encodedPixelData, imageData.data);
            return imageData;
        }
        /*
        else if(photometricInterpretation === "YBR_FULL_422" &&
                transferSyntax === "1.2.840.10008.1.2.4.50")
        {
        // need to read the encapsulated stream here i think
            var imgBlob = new Blob([encodedPixelData], {type: "image/png"});
            var r = new FileReader();
            r.readAsBinaryString(imgBlob);
            r.onload = function(){
                var img=new Image();
                img.onload = function() {
                    context.drawImage(this, 0, 0);
                };
                img.onerror = function(z) {

                };
                img.src = "data:image/jpeg;base64,"+window.btoa(r.result);
            };
            return context.getImageData(0, 0, width, height);
        }
        */
        throw "no codec for " + photometricInterpretation;
    }

    function makeColorImage(imageId, dataSet, byteArray, photometricInterpretation, frame) {

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
        var imageData = extractStoredPixels(dataSet, byteArray, photometricInterpretation, columns, rows, frame);

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
}(cornerstoneWADOImageLoader));