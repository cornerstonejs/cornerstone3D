(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeTransferSyntax(dataSet, frame) {
    var imageFrame = cornerstoneWADOImageLoader.getRawImageFrame(dataSet, frame);
    return cornerstoneWADOImageLoader.decodeImageFrame(imageFrame);
  }

  // module exports
  cornerstoneWADOImageLoader.decodeTransferSyntax = decodeTransferSyntax;

}(cornerstoneWADOImageLoader));