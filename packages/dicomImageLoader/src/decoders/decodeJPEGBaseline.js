(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJPEGBaseline(dataSet, frame)
  {
    // check to make sure codec is loaded
    if(typeof JpegImage === 'undefined') {
      throw 'No JPEG Baseline decoder loaded';
    }
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var bitsAllocated = dataSet.uint16('x00280100');
    var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);
    var jpeg = new JpegImage();
    jpeg.parse( encodedImageFrame );
    if(bitsAllocated === 8) {
      return jpeg.getData(width, height);
    }
    else if(bitsAllocated === 16) {
      return jpeg.getData16(width, height);
    }
  }

  cornerstoneWADOImageLoader.decodeJPEGBaseline = decodeJPEGBaseline;
}($, cornerstone, cornerstoneWADOImageLoader));