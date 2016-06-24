(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertPALETTECOLOR( imageFrame, rgbaBuffer ) {
    var numPixels = imageFrame.columns * imageFrame.rows;
    var palIndex=0;
    var rgbaIndex=0;
    var pixelData = imageFrame.pixelData;
    var start = imageFrame.palette.start;
    var rData = imageFrame.palette.rData;
    var gData = imageFrame.palette.gData;
    var bData = imageFrame.palette.bData;
    var shift = imageFrame.palette.bits ===8 ? 0 : 8;
    var len = imageFrame.palette.rData.length;

    for( var i=0 ; i < numPixels ; ++i ) {
      var value=pixelData[palIndex++];
      if( value < start )
        value=0;
      else if( value > start + len -1 )
        value=len-1;
      else
        value=value-start;

      rgbaBuffer[ rgbaIndex++ ] = rData[value] >> shift;
      rgbaBuffer[ rgbaIndex++ ] = gData[value] >> shift;
      rgbaBuffer[ rgbaIndex++ ] = bData[value] >> shift;
      rgbaBuffer[ rgbaIndex++ ] = 255;
    }
  }

  // module exports
  cornerstoneWADOImageLoader.convertPALETTECOLOR = convertPALETTECOLOR;

}(cornerstoneWADOImageLoader));