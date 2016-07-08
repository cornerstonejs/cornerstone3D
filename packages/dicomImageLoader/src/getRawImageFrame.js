/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function getRawImageFrame(dataSet) {
    var imageFrame = {
      transferSyntax : dataSet.string('x00020010'),
      samplesPerPixel : dataSet.uint16('x00280002'),
      photometricInterpretation : dataSet.string('x00280004'),
      planarConfiguration : dataSet.uint16('x00280006'),
      rows : dataSet.uint16('x00280010'),
      columns : dataSet.uint16('x00280011'),
      bitsAllocated : dataSet.uint16('x00280100'),
      pixelRepresentation : dataSet.uint16('x00280103'), // 0 = unsigned,
      palette: cornerstoneWADOImageLoader.getPalette(dataSet),
      storedPixelData: undefined // populated later after decoding
    };
    
    
    return imageFrame;
  }

  cornerstoneWADOImageLoader.getRawImageFrame = getRawImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));