(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJPEGBaseline(imageFrame)
  {
    // check to make sure codec is loaded
    if(typeof JpegImage === 'undefined') {
      throw 'No JPEG Baseline decoder loaded';
    }
    var jpeg = new JpegImage();
    jpeg.parse( imageFrame.pixelData);
    if(imageFrame.bitsAllocated === 8) {
      imageFrame.pixelData = jpeg.getData(imageFrame.columns, imageFrame.rows);
      return imageFrame;
    }
    else if(imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = jpeg.getData16(imageFrame.columns, imageFrame.rows);
      return imageFrame;
    }
  }

  cornerstoneWADOImageLoader.decodeJPEGBaseline = decodeJPEGBaseline;
}($, cornerstone, cornerstoneWADOImageLoader));