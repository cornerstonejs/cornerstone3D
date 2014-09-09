var cornerstoneWADOImageLoader = (function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

    function getPixelFormat(dataSet) {
        // NOTE - this should work for color images too - need to test
        var pixelRepresentation = dataSet.uint16('x00280103');
        var bitsAllocated = dataSet.uint16('x00280100');
        var photometricInterpretation = dataSet.string('x00280004');
        if(pixelRepresentation === 0 && bitsAllocated === 8) {
            return 1; // unsigned 8 bit
        } else if(pixelRepresentation === 0 && bitsAllocated === 16) {
            return 2; // unsigned 16 bit
        } else if(pixelRepresentation === 1 && bitsAllocated === 16) {
            return 3; // signed 16 bit data
        }
    }

    function extractStoredPixels(dataSet, byteArray, width, height, frame)
    {
        var pixelFormat = getPixelFormat(dataSet);
        var pixelDataElement = dataSet.elements.x7fe00010;
        var pixelDataOffset = pixelDataElement.dataOffset;
        var numPixels = width * height;

        // Note - we may want to sanity check the rows * columns * bitsAllocated * samplesPerPixel against the buffer size

        var frameOffset = 0;
        if(pixelFormat === 1) {
            frameOffset = pixelDataOffset + frame * numPixels;
            return new Uint8Array(byteArray.buffer, frameOffset, numPixels);
        }
        else if(pixelFormat === 2) {
            frameOffset = pixelDataOffset + frame * numPixels * 2;
            return new Uint16Array(byteArray.buffer, frameOffset, numPixels);
        }
        else if(pixelFormat === 3) {
            frameOffset = pixelDataOffset + frame * numPixels * 2;
            return new Int16Array(byteArray.buffer, frameOffset, numPixels);
        }
    }

    function getBytesPerPixel(dataSet)
    {
        var pixelFormat = getPixelFormat(dataSet);
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


    function makeGrayscaleImage(imageId, dataSet, byteArray, photometricInterpretation, frame) {

        // extract the DICOM attributes we need
        var pixelSpacing = cornerstoneWADOImageLoader.getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept(dataSet);
        var bytesPerPixel = getBytesPerPixel(dataSet);
        var numPixels = rows * columns;
        var sizeInBytes = numPixels * bytesPerPixel;
        var invert = (photometricInterpretation === "MONOCHROME1");
        var windowWidthAndCenter = cornerstoneWADOImageLoader.getWindowWidthAndCenter(dataSet);

        // Decompress and decode the pixel data for this image
        var storedPixelData = extractStoredPixels(dataSet, byteArray, columns, rows, frame);
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

        var deferred = $.Deferred();
        deferred.resolve(image);
        return deferred;
    }

    // module exports
    cornerstoneWADOImageLoader.makeGrayscaleImage = makeGrayscaleImage;

    return cornerstoneWADOImageLoader;
}($, cornerstone, cornerstoneWADOImageLoader));