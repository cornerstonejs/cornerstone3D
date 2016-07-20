/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getLutDescriptor(dataSet, tag) {
    if(!dataSet.elements[tag] || dataSet.elements[tag].length != 6) {
      return;
    }
    return [dataSet.uint16(tag, 0),dataSet.uint16(tag, 1), dataSet.uint16(tag, 2)]
  }

  function getLutData(lutDataSet, tag, lutDescriptor) {
    var lut = [];
    var lutData = lutDataSet.elements[tag];
    var numLutEntries = lutDescriptor[0];
    for (var i = 0; i < numLutEntries; i++) {
      // Output range is always unsigned
      if(lutDescriptor[2] === 16) {
        lut[i] = lutDataSet.uint16(tag, i);
      }
      else {
        lut[i] = lutDataSet.byteArray[i + lutData.dataOffset];
      }
    }
    return lut;
  }

  function populatePaletteColorLut(dataSet, imagePixelModule) {
    // return immediately if no palette lut elements
    if(!dataSet.elements['x00281101']) {
      return;
    }
    imagePixelModule.redPaletteColorLookupTableDescriptor =  getLutDescriptor(dataSet, 'x00281101');
    imagePixelModule.greenPaletteColorLookupTableDescriptor =  getLutDescriptor(dataSet, 'x00281102');
    imagePixelModule.bluePaletteColorLookupTableDescriptor =  getLutDescriptor(dataSet, 'x00281103');

    imagePixelModule.redPaletteColorLookupTableData =  getLutData(dataSet, 'x00281201', imagePixelModule.redPaletteColorLookupTableDescriptor);
    imagePixelModule.greenPaletteColorLookupTableData = getLutData(dataSet, 'x00281202', imagePixelModule.greenPaletteColorLookupTableDescriptor);
    imagePixelModule.bluePaletteColorLookupTableData = getLutData(dataSet, 'x00281203', imagePixelModule.bluePaletteColorLookupTableDescriptor);
  }

  function populateSmallestLargestPixelValues(dataSet, imagePixelModule) {
    var pixelRepresentation = dataSet.uint16('x00280103');
    if(pixelRepresentation === 0) {
      imagePixelModule.smallestPixelValue = dataSet.uint16('x00280106');
      imagePixelModule.largestPixelValue = dataSet.uint16('x00280107');
    } else {
      imagePixelModule.smallestPixelValue = dataSet.int16('x00280106');
      imagePixelModule.largestPixelValue = dataSet.int16('x00280107');
    }
  }

  function getImagePixelModule(dataSet) {

    var imagePixelModule = {
      samplesPerPixel: dataSet.uint16('x00280002'),
      photometricInterpretation: dataSet.string('x00280004'),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
      bitsAllocated: dataSet.uint16('x00280100'),
      bitsStored: dataSet.uint16('x00280101'),
      highBit: dataSet.uint16('x00280102'),
      pixelRepresentation: dataSet.uint16('x00280103'),
      planarConfiguration: dataSet.uint16('x00280006'),
      pixelAspectRatio: dataSet.string('x00280034'),
    };
    populateSmallestLargestPixelValues(dataSet, imagePixelModule);
    populatePaletteColorLut(dataSet, imagePixelModule);
    return imagePixelModule;

  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.getImagePixelModule = getImagePixelModule

}(cornerstoneWADOImageLoader));