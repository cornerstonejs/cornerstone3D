var cornerstoneWADOImageLoader = (function (cornerstoneWADOImageLoader) {

    "use strict";

    if(cornerstoneWADOImageLoader === undefined) {
        cornerstoneWADOImageLoader = {};
    }

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
    // module exports
    cornerstoneWADOImageLoader.getPixelSpacing = getPixelSpacing;

    return cornerstoneWADOImageLoader;
}(cornerstoneWADOImageLoader));