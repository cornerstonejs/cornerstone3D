//
// This is a cornerstone image loader for WADO requests.  It currently does not support compressed
// transfer syntaxes or big endian transfer syntaxes.  It will support implicit little endian transfer
// syntaxes but explicit little endian is strongly preferred to avoid any parsing issues related
// to SQ elements.  To request that the WADO object be returned as explicit little endian, append
// the following on your WADO url: &transferSyntax=1.2.840.10008.1.2.1
//

var cornerstoneWADOImageLoader = (function ($, cornerstone, cornerstoneWADOImageLoader) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

    function isColorImage(photoMetricInterpretation)
    {
        if(photoMetricInterpretation === "RGB" ||
            photoMetricInterpretation === "PALETTE COLOR" ||
            photoMetricInterpretation === "YBR_FULL" ||
            photoMetricInterpretation === "YBR_FULL_422" ||
            photoMetricInterpretation === "YBR_PARTIAL_422" ||
            photoMetricInterpretation === "YBR_PARTIAL_420" ||
            photoMetricInterpretation === "YBR_RCT")
        {
            return true;
        }
        else
        {
            return false;
        }
    }

    function createImageObject(dicomPart10AsArrayBuffer, imageId)
    {
        // Parse the DICOM File
        var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
        var dataSet = dicomParser.parseDicom(byteArray);

        // make the image based on whether it is color or not
        var photometricInterpretation = dataSet.string('x00280004');
        var isColor = isColorImage(photometricInterpretation);
        if(isColor === false) {
            return cornerstoneWADOImageLoader.makeGrayscaleImage(imageId, dataSet, byteArray, photometricInterpretation);
        } else {
            return cornerstoneWADOImageLoader.makeColorImage(imageId, dataSet, byteArray, photometricInterpretation);
        }
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
                if (oReq.status === 200) {
                    // request succeeded, create an image object and resolve the deferred
                    var image = createImageObject(oReq.response, imageId);

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

    return cornerstoneWADOImageLoader;
}($, cornerstone, cornerstoneWADOImageLoader));