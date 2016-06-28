/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function getRawImageFrame(dataSet, frameIndex) {
    var imageFrame = {
      transferSyntax : dataSet.string('x00020010'),
      samplesPerPixel : dataSet.uint16('x00280002'),
      photometricInterpretation : dataSet.string('x00280004'),
      planarConfiguration : dataSet.uint16('x00280006'),
      numberOfFrames : dataSet.intString('x00280008'),
      rows : dataSet.uint16('x00280010'),
      columns : dataSet.uint16('x00280011'),
      bitsAllocated : dataSet.uint16('x00280100'),
      pixelRepresentation : dataSet.uint16('x00280103'), // 0 = unsigned,
      palette: cornerstoneWADOImageLoader.getPalette(dataSet),
      pixelData: undefined
    };
    
    var pixelDataElement = dataSet.elements.x7fe00010;

    if(pixelDataElement.encapsulatedPixelData) {
      return cornerstoneWADOImageLoader.getEncapsulatedImageFrame(dataSet, imageFrame, frameIndex);
    } else {
      return cornerstoneWADOImageLoader.getUncompressedImageFrame(dataSet, imageFrame, pixelDataElement, frameIndex);
    }
  }

  cornerstoneWADOImageLoader.getRawImageFrame = getRawImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));