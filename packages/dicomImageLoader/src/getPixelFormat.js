(function (cornerstoneWADOImageLoader) {

  "use strict";

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


  // module exports
  cornerstoneWADOImageLoader.getPixelFormat = getPixelFormat;

}(cornerstoneWADOImageLoader));