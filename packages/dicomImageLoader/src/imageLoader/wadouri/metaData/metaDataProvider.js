import getNumberValues from './getNumberValues';
import parseImageId from '../parseImageId';
import dataSetCacheManager from '../dataSetCacheManager';
import getImagePixelModule from './getImagePixelModule';
import getLUTs from './getLUTs';
import getModalityLUTOutputPixelRepresentation from './getModalityLUTOutputPixelRepresentation';
import * as dicomParser from 'dicom-parser';
import * as cornerstone from 'cornerstone-core';

function metaDataProvider (type, imageId) {
  const parsedImageId = parseImageId(imageId);

  const dataSet = dataSetCacheManager.get(parsedImageId.url);

  if (!dataSet) {
    return;
  }

  if (type === 'generalSeriesModule') {
    return {
      modality: dataSet.string('x00080060'),
      seriesInstanceUID: dataSet.string('x0020000e'),
      seriesNumber: dataSet.intString('x00200011'),
      studyInstanceUID: dataSet.string('x0020000d'),
      seriesDate: dicomParser.parseDA(dataSet.string('x00080021')),
      seriesTime: dicomParser.parseTM(dataSet.string('x00080031') || '')
    };
  }

  if (type === 'patientStudyModule') {
    return {
      patientAge: dataSet.intString('x00101010'),
      patientSize: dataSet.floatString('x00101020'),
      patientWeight: dataSet.floatString('x00101030')
    };
  }

  if (type === 'imagePlaneModule') {
    return {
      pixelSpacing: getNumberValues(dataSet, 'x00280030', 2),
      imageOrientationPatient: getNumberValues(dataSet, 'x00200037', 6),
      imagePositionPatient: getNumberValues(dataSet, 'x00200032', 3),
      sliceThickness: dataSet.floatString('x00180050'),
      sliceLocation: dataSet.floatString('x00201041'),
      frameOfReferenceUID: dataSet.string('x00200052')
    };
  }

  if (type === 'imagePixelModule') {
    return getImagePixelModule(dataSet);
  }

  if (type === 'modalityLutModule') {
    return {
      rescaleIntercept: dataSet.floatString('x00281052'),
      rescaleSlope: dataSet.floatString('x00281053'),
      rescaleType: dataSet.string('x00281054'),
      modalityLUTSequence: getLUTs(dataSet.uint16('x00280103'), dataSet.elements.x00283000)
    };
  }

  if (type === 'voiLutModule') {
    const modalityLUTOutputPixelRepresentation = getModalityLUTOutputPixelRepresentation(dataSet);


    return {
      windowCenter: getNumberValues(dataSet, 'x00281050', 1),
      windowWidth: getNumberValues(dataSet, 'x00281051', 1),
      voiLUTSequence: getLUTs(modalityLUTOutputPixelRepresentation, dataSet.elements.x00283010)
    };
  }

  if (type === 'sopCommonModule') {
    return {
      sopClassUID: dataSet.string('x00080016'),
      sopInstanceUID: dataSet.string('x00080018')
    };
  }

  if (type === 'petIsotopeModule') {
    const radiopharmaceuticalInfo = dataSet.elements.x00540016;

    if (radiopharmaceuticalInfo === undefined) {
      return;
    }

    const firstRadiopharmaceuticalInfoDataSet = radiopharmaceuticalInfo.items[0].dataSet;


    return {
      radiopharmaceuticalInfo: {
        radiopharmaceuticalStartTime: dicomParser.parseTM(firstRadiopharmaceuticalInfoDataSet.string('x00181072') || ''),
        radionuclideTotalDose: firstRadiopharmaceuticalInfoDataSet.floatString('x00181074'),
        radionuclideHalfLife: firstRadiopharmaceuticalInfoDataSet.floatString('x00181075')
      }
    };
  }

}

// register our metadata provider
cornerstone.metaData.addProvider(metaDataProvider);

export default metaDataProvider;
