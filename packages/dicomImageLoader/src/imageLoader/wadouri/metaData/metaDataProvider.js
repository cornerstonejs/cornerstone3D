import external from '../../../externalModules.js';
import getNumberValues from './getNumberValues.js';
import parseImageId from '../parseImageId.js';
import dataSetCacheManager from '../dataSetCacheManager.js';
import getImagePixelModule from './getImagePixelModule.js';
import getOverlayPlaneModule from './getOverlayPlaneModule.js';
import getLUTs from './getLUTs.js';
import getModalityLUTOutputPixelRepresentation from './getModalityLUTOutputPixelRepresentation.js';
import { getDirectFrameInformation } from '../combineFrameInstanceDataset.js';
import multiframeDataset from '../retrieveMultiframeDataset.js';

function metaDataProvider(type, imageId) {
  const parsedImageId = parseImageId(imageId);

  if (type === 'multiframeModule') {
    const multiframeData = multiframeDataset.retrieveMultiframeDataset(
      parsedImageId.url
    );

    if (!multiframeData.dataSet) {
      return;
    }

    const multiframeInfo = getDirectFrameInformation(
      multiframeData.dataSet,
      multiframeData.frame
    );

    return multiframeInfo;
  }

  const { dicomParser } = external;

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
      seriesTime: dicomParser.parseTM(dataSet.string('x00080031') || ''),
      acquisitionDate: dicomParser.parseDA(dataSet.string('x00080022') || ''),
      acquisitionTime: dicomParser.parseTM(dataSet.string('x00080032') || ''),
    };
  }

  if (type === 'patientStudyModule') {
    return {
      patientAge: dataSet.intString('x00101010'),
      patientSize: dataSet.floatString('x00101020'),
      patientWeight: dataSet.floatString('x00101030'),
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
      rowCosines = [
        parseFloat(imageOrientationPatient[0]),
        parseFloat(imageOrientationPatient[1]),
        parseFloat(imageOrientationPatient[2]),
      ];
      columnCosines = [
        parseFloat(imageOrientationPatient[3]),
        parseFloat(imageOrientationPatient[4]),
        parseFloat(imageOrientationPatient[5]),
      ];
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
      columnPixelSpacing,
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
      modalityLUTSequence: getLUTs(
        dataSet.uint16('x00280103'),
        dataSet.elements.x00283000
      ),
    };
  }

  if (type === 'voiLutModule') {
    const modalityLUTOutputPixelRepresentation =
      getModalityLUTOutputPixelRepresentation(dataSet);

    return {
      windowCenter: getNumberValues(dataSet, 'x00281050', 1),
      windowWidth: getNumberValues(dataSet, 'x00281051', 1),
      voiLUTSequence: getLUTs(
        modalityLUTOutputPixelRepresentation,
        dataSet.elements.x00283010
      ),
    };
  }

  if (type === 'sopCommonModule') {
    return {
      sopClassUID: dataSet.string('x00080016'),
      sopInstanceUID: dataSet.string('x00080018'),
    };
  }

  if (type === 'petIsotopeModule') {
    const radiopharmaceuticalInfo = dataSet.elements.x00540016;

    if (radiopharmaceuticalInfo === undefined) {
      return;
    }

    const firstRadiopharmaceuticalInfoDataSet =
      radiopharmaceuticalInfo.items[0].dataSet;

    return {
      radiopharmaceuticalInfo: {
        radiopharmaceuticalStartTime: dicomParser.parseTM(
          firstRadiopharmaceuticalInfoDataSet.string('x00181072') || ''
        ),
        radionuclideTotalDose:
          firstRadiopharmaceuticalInfoDataSet.floatString('x00181074'),
        radionuclideHalfLife:
          firstRadiopharmaceuticalInfoDataSet.floatString('x00181075'),
      },
    };
  }

  if (type === 'overlayPlaneModule') {
    return getOverlayPlaneModule(dataSet);
  }

  // Note: this is not a DICOM module, but a useful metadata that can be
  // retrieved from the image
  if (type === 'transferSyntax') {
    return {
      transferSyntaxUID: dataSet.string('x00020010'),
    };
  }

  if (type === 'petSeriesModule') {
    return {
      correctedImage: dataSet.string('x00280051'),
      units: dataSet.string('x00541001'),
      decayCorrection: dataSet.string('x00541102'),
    };
  }

  if (type === 'petImageModule') {
    return {
      frameReferenceTime: dicomParser.floatString(
        dataSet.string('x00541300') || ''
      ),
      actualFrameDuration: dicomParser.intString(dataSet.string('x00181242')),
    };
  }
}

export default metaDataProvider;
