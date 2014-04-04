//
// This is a cornerstone image loader for WADO requests.  It currently does not support compressed
// transfer syntaxes or big endian transfer syntaxes.  It will support implicit little endian transfer
// syntaxes but explicit little endian is strongly preferred to avoid any parsing issues related
// to SQ elements.  To request that the WADO object be returned as explicit little endian, append
// the following on your WADO url: &transferSyntax=1.2.840.10008.1.2.1
//

(function ($, cornerstone) {

    function getPixelSpacing(dataSet)
    {
        // NOTE - these are not required for all SOP Classes
        // so we return them as undefined.  We also do not
        // deal with the complexity associated with projection
        // radiographs here and leave that to a higher layer
        var pixelSpacing = dataSet.string('x00280030');
        if(pixelSpacing && pixelSpacing.length > 0) {
            var split = pixelSpacing.split('\\');
            return {
                row: parseFloat(split[0]),
                column: parseFloat(split[1])
            };
        }
        else {
            return {
                row: undefined,
                column: undefined
            };
        }
    }

    function getPixelFormat(dataSet) {
        // NOTE - this should work for color images too - need to test
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

    function extractStoredPixels(dataSet, byteArray)
    {
        var pixelFormat = getPixelFormat(dataSet);
        var pixelDataElement = dataSet.elements.x7fe00010;
        var pixelDataOffset = pixelDataElement.dataOffset;

        // Note - we may want to sanity check the rows * columns * bitsAllocated * samplesPerPixel against the buffer size

        if(pixelFormat === 1) {
            return new Uint8Array(byteArray.buffer, pixelDataOffset);
        }
        else if(pixelFormat === 2) {
            return new Uint16Array(byteArray.buffer, pixelDataOffset);
        }
        else if(pixelFormat === 3) {
            return new Int16Array(byteArray.buffer, pixelDataOffset);
        }
    }

    function getRescaleSlopeAndIntercept(dataSet)
    {
        // NOTE - we default these to an identity transform since modality LUT
        // module is not required for all SOP Classes
        var result = {
            intercept : 0.0,
            slope: 1.0
        };

        //var rescaleIntercept  = dicomElements.x00281052;
        //var rescaleSlope  = dicomElements.x00281053;
        var rescaleIntercept = dataSet.floatString('x00281052');
        var rescaleSlope = dataSet.floatString('x00281053');

        if(rescaleIntercept ) {
            result.intercept = rescaleIntercept;
        }
        if(rescaleSlope ) {
            result.slope = rescaleSlope;
        }
        return result;
    }

    function getWindowWidthAndCenter(dataSet)
    {
        // NOTE - Default these to undefined since they may not be present as
        // they are not present or required for all sop classes.  We leave it up
        // to a higher layer to determine reasonable default values for these
        // if they are not provided.  We also use the first ww/wc values if
        // there are multiple and again leave it up the higher levels to deal with
        // this
        var result = {
            windowCenter : undefined,
            windowWidth: undefined
        };

        var windowCenter = dataSet.floatString('x00281050');
        var windowWidth = dataSet.floatString('x00281051');

        if(windowCenter) {
            result.windowCenter = windowCenter;
        }
        if(windowWidth ) {
            result.windowWidth = windowWidth;
        }
        return result;
    }

    function setMinMaxPixelValue(image)
    {
        // we always calculate the min max values since they are not always
        // present in DICOM and we don't want to trust them anyway as cornerstone
        // depends on us providing reliable values for these
        var min = 65535;
        var max = -32768;
        var numPixels = image.width * image.height;
        var pixelData = image.storedPixelData;
        for(var index = 0; index < numPixels; index++) {
            var spv = pixelData[index];
            // TODO: test to see if it is faster to use conditional here rather than calling min/max functions
            min = Math.min(min, spv);
            max = Math.max(max, spv);
        }

        image.minPixelValue = min;
        image.maxPixelValue = max;
    }

    function createImageObject(dicomPart10AsArrayBuffer)
    {
        // Parse the DICOM File
        var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
        var dataSet = dicomParser.parseDicom(byteArray);

        // extract the DICOM attributes we need
        var pixelSpacing = getPixelSpacing(dataSet);
        var rows = dataSet.uint16('x00280010');
        var columns = dataSet.uint16('x00280011');
        var rescaleSlopeAndIntercept = getRescaleSlopeAndIntercept(dataSet);
        var windowWidthAndCenter = getWindowWidthAndCenter(dataSet);

        // Extract the various attributes we need
        var image = {
            minPixelValue : -32767, // calculated below
            maxPixelValue : 65535, // calculated below
            slope: rescaleSlopeAndIntercept.slope,
            intercept: rescaleSlopeAndIntercept.intercept,
            windowCenter : windowWidthAndCenter.windowCenter,
            windowWidth : windowWidthAndCenter.windowWidth,
            storedPixelData: extractStoredPixels(dataSet, byteArray),
            rows: rows,
            columns: columns,
            height: rows,
            width: columns,
            color: false,
            columnPixelSpacing: pixelSpacing.column,
            rowPixelSpacing: pixelSpacing.row,
            data: dataSet,
            invert: false
        };


        // TODO: deal with pixel padding and all of the various issues by setting it to min pixel value (or lower)
        // TODO: Add support for color by converting all formats to RGB
        // TODO: Mask out overlays embedded in pixel data above high bit

        setMinMaxPixelValue(image);

        // invert pixels if monochrome1
        var photometricInterpretation = dataSet.string('x00280004');
        if(photometricInterpretation !== undefined) {
            if(photometricInterpretation.trim() === "MONOCHROME1")
            {
                image.invert = true;
            }
        }

        if(image.windowCenter === undefined) {
            var maxVoi = image.maxPixelValue * image.slope + image.intercept;
            var minVoi = image.minPixelValue * image.slope + image.intercept;
            image.windowWidth = maxVoi - minVoi;
            image.windowCenter = (maxVoi + minVoi) / 2;
        }


        return image;
    }

    // Loads an image given an imageId
    // wado url example:
    // http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
    // NOTE: supposedly the instance will be returned in Explicit Little Endian transfer syntax if you don't
    // specify a transferSyntax but Osirix doesn't do this and seems to return it with the transfer syntax it is
    // stored as.
    function loadImage(imageId) {
        // create a deferred object
        // TODO: Consider not using jquery for deferred - maybe cujo's when library
        var deferred = $.Deferred();

        // Make the request for the DICOM data
        // TODO: consider using cujo's REST library here?
        var oReq = new XMLHttpRequest();
        oReq.open("get", imageId, true);
        oReq.responseType = "arraybuffer";
        oReq.onreadystatechange = function(oEvent) {
            // TODO: consider sending out progress messages here as we receive the pixel data
            if (oReq.readyState === 4)
            {
                if (oReq.status == 200) {
                    // request succeeded, create an image object and resolve the deferred
                    var image = createImageObject(oReq.response);

                    deferred.resolve(image);
                }
                // TODO: Check for errors and reject the deferred if they happened
                else {
                    // TODO: add some error handling here
                    // request failed, reject the deferred
                    deferred.reject();
                }
            }
        };
        oReq.send();

        return deferred;
    }

    // steam the http and https prefixes so we can use wado URL's directly
    cornerstone.registerImageLoader('http', loadImage);
    cornerstone.registerImageLoader('https', loadImage);

    return cornerstone;
}($, cornerstone));