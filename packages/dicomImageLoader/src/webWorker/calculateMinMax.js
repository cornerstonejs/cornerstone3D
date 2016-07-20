(function (cornerstoneWADOImageLoader) {

  "use strict";

  function calculateMinMax(imageFrame)
  {
    if(imageFrame.smallestPixelValue !== undefined && imageFrame.largestPixelValue !== undefined) {
      return;
    }
    var storedPixelData = imageFrame.pixelData;

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

    imageFrame.smallestPixelValue = min;
    imageFrame.largestPixelValue = max;
  }

  // module exports
  cornerstoneWADOImageLoader.calculateMinMax = calculateMinMax;

}(cornerstoneWADOImageLoader));

