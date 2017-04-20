"use strict";

function getLUT(pixelRepresentation, lutDataSet) {
  var numLUTEntries = lutDataSet.uint16('x00283002', 0);
  if(numLUTEntries === 0) {
    numLUTEntries = 65535;
  }
  var firstValueMapped = 0;
  if(pixelRepresentation === 0) {
    firstValueMapped = lutDataSet.uint16('x00283002', 1);
  } else {
    firstValueMapped = lutDataSet.int16('x00283002', 1);
  }
  var numBitsPerEntry = lutDataSet.uint16('x00283002', 2);
  //console.log('LUT(', numLUTEntries, ',', firstValueMapped, ',', numBitsPerEntry, ')');
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


function getLUTs(pixelRepresentation, lutSequence) {
  if(!lutSequence || !lutSequence.items.length) {
    return;
  }
  var luts = [];
  for(var i=0; i < lutSequence.items.length; i++) {
    var lutDataSet = lutSequence.items[i].dataSet;
    var lut = getLUT(pixelRepresentation, lutDataSet);
    if(lut) {
      luts.push(lut);
    }
  }
  return luts;
}

export default getLUTs;
