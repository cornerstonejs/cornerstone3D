var cornerstoneWADOImageLoader = (function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

    var canvas = document.createElement('canvas');
    var lastImageIdDrawn = "";

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

    function extractStoredPixels(dataSet, byteArray, photometricInterpretation, width, height, frame) {
        canvas.height = height;
        canvas.width = width;

        var pixelDataElement = dataSet.elements.x7fe00010;
        var pixelDataOffset = pixelDataElement.dataOffset;
        var transferSyntax = dataSet.string('x00020010');

        var frameSize = width * height * 3;
        var frameOffset = pixelDataOffset + frame * frameSize;
        var encodedPixelData;// = new Uint8Array(byteArray.buffer, frameOffset);
        var context = canvas.getContext('2d');
        var imageData = context.createImageData(width, height);

        var deferred = $.Deferred();

        if (photometricInterpretation === "RGB") {
            encodedPixelData = new Uint8Array(byteArray.buffer, frameOffset, frameSize);
            try {
                cornerstoneWADOImageLoader.decodeRGB(encodedPixelData, imageData.data);
            } catch (error) {
                deferred.reject(error);
            }
            deferred.resolve(imageData);
            return deferred;
        }
        else if (photometricInterpretation === "YBR_FULL")
        {
            encodedPixelData = new Uint8Array(byteArray.buffer, frameOffset, frameSize);
            try {
                cornerstoneWADOImageLoader.decodeYBRFull(encodedPixelData, imageData.data);
            } catch (error) {
                deferred.reject(error);
            }
            deferred.resolve(imageData);
            return deferred;
        }
        else if(photometricInterpretation === "YBR_FULL_422" &&
                transferSyntax === "1.2.840.10008.1.2.4.50")
        {
            encodedPixelData = dicomParser.readEncapsulatedPixelData(dataSet, dataSet.elements.x7fe00010, frame);
            // need to read the encapsulated stream here i think
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
                    context.drawImage(this, 0, 0);
                    imageData = context.getImageData(0, 0, width, height);
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

        var deferred = $.Deferred();

        // Decompress and decode the pixel data for this image
        var imageDataPromise = extractStoredPixels(dataSet, byteArray, photometricInterpretation, columns, rows, frame);
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

    return cornerstoneWADOImageLoader;
}($, cornerstone, cornerstoneWADOImageLoader));