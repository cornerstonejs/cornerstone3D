/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getNumberValues(dataSet, tag, minimumLength) {
    var values = [];
    var valueAsString = dataSet.string(tag);
    if(!valueAsString) {
      return;
    }
    var split = valueAsString.split('\\');
    if(minimumLength && split.length < minimumLength) {
      return;
    }
    for(var i=0;i < split.length; i++) {
      values.push(parseFloat(split[i]));
    }
    return values;
  }

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

  function getMinStoredPixelValue(dataSet) {
    var pixelRepresentation = dataSet.uint16('x00280103');
    var bitsStored = dataSet.uint16('x00280101');
    if(pixelRepresentation === 0) {
      return 0;
    }
    return -1 << (bitsStored -1);
  }

  // 0 = unsigned / US, 1 = signed / SS
  function getModalityLUTOutputPixelRepresentation(dataSet) {

    // CT SOP Classes are always signed
    var sopClassUID = dataSet.string('x00080016');
    if(sopClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
      sopClassUID === '1.2.840.10008.5.1.4.1.1.2.1') {
      return 1;
    }

    // if rescale intercept and rescale slope are present, pass the minimum stored
    // pixel value through them to see if we get a signed output range
    var rescaleIntercept = dataSet.floatString('x00281052');
    var rescaleSlope = dataSet.floatString('x00281053');
    if(rescaleIntercept !== undefined && rescaleSlope !== undefined) {
      var minStoredPixelValue = getMinStoredPixelValue(dataSet); //
      var minModalityLutValue = minStoredPixelValue * rescaleSlope + rescaleIntercept;
      if (minModalityLutValue < 0) {
        return 1;
      } else {
        return 0;
      }
    }

    // Output of non linear modality lut is always unsigned
    if(dataSet.elements.x00283000 && dataSet.elements.x00283000.length > 0) {
      return 0;
    }

    // If no modality lut transform, output is same as pixel representation
    var pixelRepresentation = dataSet.uint16('x00280103');
    return pixelRepresentation;
  }

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

  function metaDataProvider(type, imageId) {
    var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(imageId);

    var dataSet = cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.get(parsedImageId.url);
    if(!dataSet) {
      return;
    }

    if (type === 'imagePlaneModule') {
      return {
        pixelSpacing: getNumberValues(dataSet, 'x00280030', 2),
        imageOrientationPatient: getNumberValues(dataSet, 'x00200037', 6),
        imagePositionPatient: getNumberValues(dataSet, 'x00200032', 3),
        sliceThickness: dataSet.floatString('x00180050'),
        sliceLocation: dataSet.floatString('x00201041')
      };
    }

    if (type === 'imagePixelModule') {
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

    if (type === 'modalityLutModule') {
      return {
        rescaleIntercept : dataSet.floatString('x00281052'),
        rescaleSlope : dataSet.floatString('x00281053'),
        rescaleType: dataSet.string('x00281054'),
        modalityLUTSequence : getLUTs(dataSet.uint16('x00280103'), dataSet.elements.x00283000)
      };
    }

    if (type === 'voiLutModule') {
      return {
        windowCenter : getNumberValues(dataSet, 'x00281050', 1),
        windowWidth : getNumberValues(dataSet, 'x00281051', 1),
        voiLUTSequence : getLUTs(getModalityLUTOutputPixelRepresentation(dataSet), dataSet.elements.x00283010)
      };
    }

    if (type === 'sopCommonModule') {
      return {
        sopClassUID : dataSet.string('x00080016'),
        sopInstanceUID : dataSet.string('x00080018'),
      };
    }

  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.metaDataProvider = metaDataProvider

}(cornerstoneWADOImageLoader));