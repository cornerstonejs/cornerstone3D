(function (cornerstoneWADOImageLoader) {

  "use strict";

  function createImageObject( dataSet, imageId, frame ) {
    if(frame === undefined) {
      frame = 0;
    }

    // make the image based on whether it is color or not
    var photometricInterpretation = dataSet.string('x00280004');
    var isColor = cornerstoneWADOImageLoader.isColorImage(photometricInterpretation);
    if(isColor === false) {
      return cornerstoneWADOImageLoader.makeGrayscaleImage(imageId, dataSet, frame);
    } else {
      return cornerstoneWADOImageLoader.makeColorImage(imageId, dataSet, frame);
    }
  }

  // module exports
  cornerstoneWADOImageLoader.createImageObject = createImageObject;

}(cornerstoneWADOImageLoader));