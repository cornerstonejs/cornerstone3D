(function (cornerstoneWADOImageLoader) {

    "use strict";

    function getPixelSpacing(dataSet) {
      // NOTE - these are not required for all SOP Classes
      // so we return them as undefined.  We also do not
      // deal with the complexity associated with projection
      // radiographs here and leave that to a higher layer
      var pixelSpacing = dataSet.string('x00280030');
      if (pixelSpacing && pixelSpacing.length > 0) {
        var split = pixelSpacing.split('\\');

        // Make sure that neither pixel spacing value is 0 or undefined
        if (parseFloat(split[0]) && parseFloat(split[1])) {
          return {
            row: parseFloat(split[0]),
            column: parseFloat(split[1])
          };
        }
      }

      return {
        row: undefined,
        column: undefined
      };
    }
    // module exports
    cornerstoneWADOImageLoader.getPixelSpacing = getPixelSpacing;
}(cornerstoneWADOImageLoader));