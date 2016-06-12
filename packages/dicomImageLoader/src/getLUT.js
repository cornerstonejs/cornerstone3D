(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getLUT(pixelRepresentation, lutDataSet) {
    // Make sure all required LUT entries are present
    if(!lutDataSet.elements.x00283002 ||
      !lutDataSet.elements.x00283002 ||
      !lutDataSet.elements.x00283006) {
      return;
    }

    // Parse the lut descriptor
    var numLUTEntries = lutDataSet.uint16('x00283002', 0);
    if(numLUTEntries === 0) {
      numLUTEntries = 65535;
    }
    var firstValueMapped;
    if(pixelRepresentation === 0) {
      firstValueMapped = lutDataSet.uint16('x00283002', 1);
    } else {
      firstValueMapped = lutDataSet.int16('x00283002', 1);
    }
    var numBitsPerEntry = lutDataSet.uint16('x00283002', 2);
    //console.log('LUT(', numLUTEntries, ',', firstValueMapped, ',', numBitsPerEntry, ')');

    // Validate the LUT descriptor
    if(numLUTEntries === undefined ||
      firstValueMapped === undefined ||
      numBitsPerEntry === undefined) {
      return;
    }

    // Create the LUT object
    var lut = {
      id : '1',
      firstValueMapped: firstValueMapped,
      numBitsPerEntry : numBitsPerEntry,
      lut : []
    };

    //console.log("minValue=", minValue, "; maxValue=", maxValue);
    for (var i = 0; i < numLUTEntries; i++) {
      if(pixelRepresentation === 0) {
        lut.lut[i] = lutDataSet.uint16('x00283006', i);
      } else {
        lut.lut[i] = lutDataSet.int16('x00283006', i);
      }
    }
    return lut;
  }
  // module exports
  cornerstoneWADOImageLoader.getLUT = getLUT;

}(cornerstoneWADOImageLoader));

