/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getImageFrame(imageId) {
    var imagePixelModule = cornerstoneWADOImageLoader.wadors.metaDataProvider('imagePixelModule', imageId);

    var imageFrame = {
      samplesPerPixel : imagePixelModule.samplesPerPixel,
      photometricInterpretation : imagePixelModule.photometricInterpretation,
      planarConfiguration : imagePixelModule.planarConfiguration,
      rows : imagePixelModule.rows,
      columns : imagePixelModule.columns,
      bitsAllocated : imagePixelModule.bitsAllocated,
      pixelRepresentation : imagePixelModule.pixelRepresentation, // 0 = unsigned,
      smallestPixelValue: imagePixelModule.smallestPixelValue,
      largestPixelValue: imagePixelModule.largestPixelValue,
      palette: undefined, // todo cornerstoneWADOImageLoader.getPalette(dataSet),
      storedPixelData: undefined // populated later after decoding
    };

    return imageFrame;
  }

  cornerstoneWADOImageLoader.wadors.getImageFrame = getImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));