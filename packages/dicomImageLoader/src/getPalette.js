(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getPaletteLength(dataSet) {
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

    return len;
  }


  function getPalette(dataSet) {

    // if no palette return undefined
    if(!dataSet.elements.x00281101 ||
      !dataSet.elements.x00281201 ||
      !dataSet.elements.x00281202 ||
      !dataSet.elements.x00281203) {
      return;
    }

    // Build the palette object
    var len = getPaletteLength(dataSet);

    var buffer = dataSet.byteArray.buffer;

    return {
      start: dataSet.int16('x00281101',1),
      bits: dataSet.int16('x00281101',2),
      rData : new Uint16Array(buffer, dataSet.elements.x00281201.dataOffset, len),
      gData : new Uint16Array(buffer, dataSet.elements.x00281202.dataOffset, len),
      bData : new Uint16Array(buffer, dataSet.elements.x00281203.dataOffset, len)
    };

  }
  // module exports
  cornerstoneWADOImageLoader.getPalette = getPalette;
}(cornerstoneWADOImageLoader));