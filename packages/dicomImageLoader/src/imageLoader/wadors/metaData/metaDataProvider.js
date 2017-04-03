/**
 */
(function (cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  var getNumberValues = cornerstoneWADOImageLoader.wadors.getNumberValues;
  var getValue = cornerstoneWADOImageLoader.wadors.getValue;
  var getNumberValue = cornerstoneWADOImageLoader.wadors.getNumberValue;

  function metaDataProvider(type, imageId) {
    var metaData = cornerstoneWADOImageLoader.wadors.metaDataManager.get(imageId);
    if(!metaData) {
      return;
    }

    if(type === 'generalSeriesModule') {
      return {
        modality: getValue(metaData['00080060']),
        seriesInstanceUID: getValue(metaData['0020000e']),
        seriesNumber: getNumberValue(metaData['00200011']),
        studyInstanceUID: getValue(metaData['0020000d']),
        seriesDate: dicomParser.parseDA(getValue(metaData['00080021'])),
        seriesTime: dicomParser.parseTM(getValue(metaData['00080031'], 0, ''))
      };
    }

    if(type === 'patientStudyModule') {
      return {
        patientAge: getNumberValue(metaData['00101010']),
        patientSize: getNumberValue(metaData['00101020']),
        patientWeight: getNumberValue(metaData['00101030'])
      }
    }

    if (type === 'imagePlaneModule') {
      return {
        pixelSpacing: getNumberValues(metaData['00280030'], 2),
        imageOrientationPatient: getNumberValues(metaData['00200037'], 6),
        imagePositionPatient: getNumberValues(metaData['00200032'], 3),
        sliceThickness: getNumberValue(metaData['00180050']),
        sliceLocation: getNumberValue(metaData['00201041'])
      };
    }

    if (type === 'imagePixelModule') {
      return {
        samplesPerPixel: getValue(metaData['00280002']),
        photometricInterpretation: getValue(metaData['00280004']),
        rows: getValue(metaData['00280010']),
        columns: getValue(metaData['00280011']),
        bitsAllocated: getValue(metaData['00280100']),
        bitsStored: getValue(metaData['00280101']),
        highBit: getValue(metaData['00280102']),
        pixelRepresentation: getValue(metaData['00280103']),
        planarConfiguration: getValue(metaData['00280006']),
        pixelAspectRatio: getValue(metaData['00280034']),
        smallestPixelValue: getValue(metaData['00280106']),
        largestPixelValue: getValue(metaData['00280107'])
        // TODO Color Palette
      };
    }

    if (type === 'voiLutModule') {
      return {
        // TODO VOT LUT Sequence
        windowCenter : getNumberValues(metaData['00281050'], 1),
        windowWidth : getNumberValues(metaData['00281051'], 1)
      };
    }

    if (type === 'modalityLutModule') {
      return {
        // TODO VOT LUT Sequence
        rescaleIntercept : getNumberValue(metaData['00281052']),
        rescaleSlope : getNumberValue(metaData['00281053']),
        rescaleType: getValue(metaData['00281054'])
      };
    }

    if (type === 'sopCommonModule') {
      return {
        sopClassUID : getValue(metaData['00080016']),
        sopInstanceUID : getValue(metaData['00080018'])
      };
    }

    if (type === 'petIsotopeModule') {
      var radiopharmaceuticalInfo = getValue(metaData['00540016']);
      if (radiopharmaceuticalInfo === undefined) {
        return;
      }

      return {
        radiopharmaceuticalInfo: {
          radiopharmaceuticalStartTime: dicomParser.parseTM(getValue(radiopharmaceuticalInfo['00181072'], 0, '')),
          radionuclideTotalDose: getNumberValue(radiopharmaceuticalInfo['00181074']),
          radionuclideHalfLife: getNumberValue(radiopharmaceuticalInfo['00181075'])
        }
      };
    }

  }


  cornerstone.metaData.addProvider(metaDataProvider);

  // module exports
  cornerstoneWADOImageLoader.wadors.metaDataProvider = metaDataProvider

}(cornerstone, cornerstoneWADOImageLoader));