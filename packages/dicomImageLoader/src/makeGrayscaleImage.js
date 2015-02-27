var cornerstoneWADOImageLoader = (function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

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

    function extractJPEG2000Pixels(dataSet, width, height, frame)
    {
        var compressedPixelData = dicomParser.readEncapsulatedPixelData(dataSet, dataSet.elements.x7fe00010, frame);
        var jpxImage = new JpxImage();
        jpxImage.parse(compressedPixelData);

        var j2kWidth = jpxImage.width;
        var j2kHeight = jpxImage.height;
        if(j2kWidth !== width) {
            throw 'JPEG2000 decoder returned width of ' + j2kWidth + ', when ' + width + ' is expected';
        }
        if(j2kHeight !== height) {
            throw 'JPEG2000 decoder returned width of ' + j2kHeight + ', when ' + height + ' is expected';
        }
        var componentsCount = jpxImage.componentsCount;
        if(componentsCount !== 1) {
            throw 'JPEG2000 decoder returned a componentCount of ' + componentsCount + ', when 1 is expected';
        }
        var tileCount = jpxImage.tiles.length;
        if(tileCount !== 1) {
            throw 'JPEG2000 decoder returned a tileCount of ' + tileCount + ', when 1 is expected';
        }
        var tileComponents = jpxImage.tiles[0];
        var pixelData = tileComponents.items;
        return pixelData;
    }

    function extractUncompressedPixels(dataSet, width, height, frame)
    {
        var pixelFormat = getPixelFormat(dataSet);
        var pixelDataElement = dataSet.elements.x7fe00010;
        var pixelDataOffset = pixelDataElement.dataOffset;
        var numPixels = width * height;
        // Note - we may want to sanity check the rows * columns * bitsAllocated * samplesPerPixel against the buffer size

        var frameOffset = 0;
        if(pixelFormat === 1) {
            frameOffset = pixelDataOffset + frame * numPixels;
            return new Uint8Array(dataSet.byteArray.buffer, frameOffset, numPixels);
        }
        else if(pixelFormat === 2) {
            frameOffset = pixelDataOffset + frame * numPixels * 2;
            return new Uint16Array(dataSet.byteArray.buffer, frameOffset, numPixels);
        }
        else if(pixelFormat === 3) {
            frameOffset = pixelDataOffset + frame * numPixels * 2;
            return new Int16Array(dataSet.byteArray.buffer, frameOffset, numPixels);
        }
    }

    function extractStoredPixels(dataSet, width, height, frame)
    {
        var transferSyntax = dataSet.string('x00020010');

        if(transferSyntax === "1.2.840.10008.1.2.4.90" || // JPEG 2000 lossless
            transferSyntax === "1.2.840.10008.1.2.4.91") // JPEG 2000 lossy
        {
            return extractJPEG2000Pixels(dataSet, width, height, frame);
        }

        return extractUncompressedPixels(dataSet, width, height, frame);
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
        var storedPixelData = extractStoredPixels(dataSet, columns, rows, frame);
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