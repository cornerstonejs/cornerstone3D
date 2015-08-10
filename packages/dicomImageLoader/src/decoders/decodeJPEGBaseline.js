(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";
  function decodeJPEGBaseline(dataSet, frame)
  {
    var pixelDataElement = dataSet.elements.x7fe00010;
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var bitsAllocated = dataSet.uint16('x00280100');
    var frameData = dicomParser.readEncapsulatedPixelData(dataSet, pixelDataElement, frame);
    var jpeg = new JpegImage();
    jpeg.parse( frameData );
    if(bitsAllocated === 8) {
      return jpeg.getData(width, height);
    }
    else if(bitsAllocated === 16) {
      return jpeg.getData16(width, height);
    }
  }

  cornerstoneWADOImageLoader.decodeJPEGBaseline = decodeJPEGBaseline;
}($, cornerstone, cornerstoneWADOImageLoader));