(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertPALETTECOLOR( imageFrame, rgbaBuffer, dataSet ) {
    var len=dataSet.int16('x00281101',0);

    // Account for zero-values for the lookup table length
    //
    // "The first Palette Color Lookup Table Descriptor value is the number of entries in the lookup table.
    //  When the number of table entries is equal to 2^16 then this value shall be 0."
    //
    // See: http://dicom.nema.org/MEDICAL/Dicom/2015c/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.5
    if (!len) {
      len = 65536;
    }

    var start=dataSet.int16('x00281101',1);
    var bits=dataSet.int16('x00281101',2);
    var shift = (bits===8 ? 0 : 8 );

    var buffer = dataSet.byteArray.buffer;
    var rData=new Uint16Array( buffer, dataSet.elements.x00281201.dataOffset, len );
    var gData=new Uint16Array( buffer, dataSet.elements.x00281202.dataOffset, len );
    var bData=new Uint16Array( buffer, dataSet.elements.x00281203.dataOffset, len );

    var numPixels = dataSet.uint16('x00280010') * dataSet.uint16('x00280011');
    var palIndex=0;
    var rgbaIndex=0;

    for( var i=0 ; i < numPixels ; ++i ) {
      var value=imageFrame[palIndex++];
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