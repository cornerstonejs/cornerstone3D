"use strict";

function convertPALETTECOLOR( imageFrame, rgbaBuffer ) {
  var numPixels = imageFrame.columns * imageFrame.rows;
  var palIndex=0;
  var rgbaIndex=0;
  var pixelData = imageFrame.pixelData;
  var start = imageFrame.redPaletteColorLookupTableDescriptor[1];
  var rData = imageFrame.redPaletteColorLookupTableData;
  var gData = imageFrame.greenPaletteColorLookupTableData;
  var bData = imageFrame.bluePaletteColorLookupTableData;
  var shift = imageFrame.redPaletteColorLookupTableDescriptor[2] === 8 ? 0 : 8;
  var len = imageFrame.redPaletteColorLookupTableData.length;
  if(len === 0) {
    len = 65535;
  }

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

export default convertPALETTECOLOR;
