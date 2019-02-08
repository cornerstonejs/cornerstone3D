import external from '../../../externalModules.js';
import getNumberValues from './getNumberValues.js';
import parseImageId from '../parseImageId.js';
import dataSetCacheManager from '../dataSetCacheManager.js';
import getImagePixelModule from './getImagePixelModule.js';
import getLUTs from './getLUTs.js';
import getModalityLUTOutputPixelRepresentation from './getModalityLUTOutputPixelRepresentation.js';

function metaDataProvider (type, imageId) {
  const { dicomParser } = external;
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

    const imageOrientationPatient = getNumberValues(dataSet, 'x00200037', 6);
    const imagePositionPatient = getNumberValues(dataSet, 'x00200032', 3);
    const pixelSpacing = getNumberValues(dataSet, 'x00280030', 2);
    let columnPixelSpacing = null;
    let rowPixelSpacing = null;

    if (pixelSpacing) {
      rowPixelSpacing = pixelSpacing[0];
      columnPixelSpacing = pixelSpacing[1];
    }

    let rowCosines = null;
    let columnCosines = null;

    if (imageOrientationPatient) {
      rowCosines = [parseFloat(imageOrientationPatient[0]), parseFloat(imageOrientationPatient[1]), parseFloat(imageOrientationPatient[2])];
      columnCosines = [parseFloat(imageOrientationPatient[3]), parseFloat(imageOrientationPatient[4]), parseFloat(imageOrientationPatient[5])];
    }

    return {
      frameOfReferenceUID: dataSet.string('x00200052'),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
      imageOrientationPatient,
      rowCosines,
      columnCosines,
      imagePositionPatient,
      sliceThickness: dataSet.floatString('x00180050'),
      sliceLocation: dataSet.floatString('x00201041'),
      pixelSpacing,
      rowPixelSpacing,
      columnPixelSpacing
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

  if (type === 'overlayPlaneModule') {
    const overlays = [];

    for (let overlayGroup = 0x00; overlayGroup <= 0x1E; overlayGroup += 0x02) {
      let groupStr = `x60${overlayGroup.toString(16)}`;
      if (groupStr.length === 4) {
        groupStr = `x600${overlayGroup.toString(16)}`;
      }

      const data = dataSet.elements[`${groupStr}3000`];
      if (!data) {
        continue;
      }

      const pixelData = [];
      for (let i = 0; i < data.length; i++) {
        for (let k = 0; k < 8; k++) {
          const byte_as_int = dataSet.byteArray[data.dataOffset + i];
          pixelData[i * 8 + k] = (byte_as_int >> k) & 0b1; // eslint-disable-line no-bitwise
        }
      }

      overlays.push({
        rows: dataSet.uint16(`${groupStr}0010`),
        columns: dataSet.uint16(`${groupStr}0011`),
        type: dataSet.string(`${groupStr}0040`),
        x: dataSet.int16(`${groupStr}0050`, 1) - 1,
        y: dataSet.int16(`${groupStr}0050`, 0) - 1,
        pixelData,
        description: dataSet.string(`${groupStr}0022`),
        label: dataSet.string(`${groupStr}1500`),
        roiArea: dataSet.string(`${groupStr}1301`),
        roiMean: dataSet.string(`${groupStr}1302`),
        roiStandardDeviation: dataSet.string(`${groupStr}1303`)
      });
    }

    return {
      overlays
    };
  }
}

export default metaDataProvider;
