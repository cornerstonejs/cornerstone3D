import external from '../../../externalModules.js';
import getNumberValues from './getNumberValues.js';
import getNumberValue from './getNumberValue.js';
import getOverlayPlaneModule from './getOverlayPlaneModule.js';
import metaDataManager from '../metaDataManager.js';
import getValue from './getValue.js';
//import fixNMMetadata from './fixNMMetadata.js';
import {
  getMultiframeInformation,
  getFrameInformation,
} from '../combineFrameInstance.js';
import multiframeMetadata from '../retrieveMultiframeMetadata.js';

function metaDataProvider(type, imageId) {
  if (type === 'multiframeModule') {
    // the get function removes the PerFrameFunctionalGroupsSequence
    const { metadata, frame } =
      multiframeMetadata.retrieveMultiframeMetadata(imageId);

    if (!metadata) {
      return;
    }
    const {
      PerFrameFunctionalGroupsSequence,
      SharedFunctionalGroupsSequence,
      NumberOfFrames,
    } = getMultiframeInformation(metadata);

    if (PerFrameFunctionalGroupsSequence || NumberOfFrames > 1) {
      const { shared, perFrame } = getFrameInformation(
        PerFrameFunctionalGroupsSequence,
        SharedFunctionalGroupsSequence,
        frame
      );

      return {
        NumberOfFrames,
        //PerFrameFunctionalGroupsSequence,
        PerFrameFunctionalInformation: perFrame,
        SharedFunctionalInformation: shared,
      };
    }

    return {
      NumberOfFrames,
      //PerFrameFunctionalGroupsSequence,
    };
  }
  const { dicomParser } = external;

  const metaData = metaDataManager.get(imageId);

  if (!metaData) {
    return;
  }

  if (type === 'generalSeriesModule') {
    return {
      modality: getValue(metaData['00080060']),
      seriesInstanceUID: getValue(metaData['0020000E']),
      seriesNumber: getNumberValue(metaData['00200011']),
      studyInstanceUID: getValue(metaData['0020000D']),
      seriesDate: dicomParser.parseDA(getValue(metaData['00080021'])),
      seriesTime: dicomParser.parseTM(getValue(metaData['00080031'], 0, '')),
      acquisitionDate: dicomParser.parseDA(getValue(metaData['00080022']), ''),
      acquisitionTime: dicomParser.parseTM(
        getValue(metaData['00080032'], 0, '')
      ),
    };
  }

  if (type === 'patientStudyModule') {
    return {
      patientAge: getNumberValue(metaData['00101010']),
      patientSize: getNumberValue(metaData['00101020']),
      patientSex: getValue(metaData['00100040']),
      patientWeight: getNumberValue(metaData['00101030']),
    };
  }

  if (type === 'imagePlaneModule') {
    //metaData = fixNMMetadata(metaData);
    const imageOrientationPatient = getNumberValues(metaData['00200037'], 6);
    const imagePositionPatient = getNumberValues(metaData['00200032'], 3);
    const pixelSpacing = getNumberValues(metaData['00280030'], 2);

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
      frameOfReferenceUID: getValue(metaData['00200052']),
      rows: getNumberValue(metaData['00280010']),
      columns: getNumberValue(metaData['00280011']),
      imageOrientationPatient,
      rowCosines,
      columnCosines,
      imagePositionPatient,
      sliceThickness: getNumberValue(metaData['00180050']),
      sliceLocation: getNumberValue(metaData['00201041']),
      pixelSpacing,
      rowPixelSpacing,
      columnPixelSpacing,
    };
  }

  if (type === 'imagePixelModule') {
    return {
      samplesPerPixel: getNumberValue(metaData['00280002']),
      photometricInterpretation: getValue(metaData['00280004']),
      rows: getNumberValue(metaData['00280010']),
      columns: getNumberValue(metaData['00280011']),
      bitsAllocated: getNumberValue(metaData['00280100']),
      bitsStored: getNumberValue(metaData['00280101']),
      highBit: getValue(metaData['00280102']),
      pixelRepresentation: getNumberValue(metaData['00280103']),
      planarConfiguration: getNumberValue(metaData['00280006']),
      pixelAspectRatio: getValue(metaData['00280034']),
      smallestPixelValue: getNumberValue(metaData['00280106']),
      largestPixelValue: getNumberValue(metaData['00280107']),
      redPaletteColorLookupTableDescriptor: getNumberValues(
        metaData['00281101']
      ),
      greenPaletteColorLookupTableDescriptor: getNumberValues(
        metaData['00281102']
      ),
      bluePaletteColorLookupTableDescriptor: getNumberValues(
        metaData['00281103']
      ),
      redPaletteColorLookupTableData: getNumberValues(metaData['00281201']),
      greenPaletteColorLookupTableData: getNumberValues(metaData['00281202']),
      bluePaletteColorLookupTableData: getNumberValues(metaData['00281203']),
    };
  }

  if (type === 'voiLutModule') {
    return {
      // TODO VOT LUT Sequence
      windowCenter: getNumberValues(metaData['00281050'], 1),
      windowWidth: getNumberValues(metaData['00281051'], 1),
    };
  }

  if (type === 'modalityLutModule') {
    return {
      // TODO VOT LUT Sequence
      rescaleIntercept: getNumberValue(metaData['00281052']),
      rescaleSlope: getNumberValue(metaData['00281053']),
      rescaleType: getValue(metaData['00281054']),
    };
  }

  if (type === 'sopCommonModule') {
    return {
      sopClassUID: getValue(metaData['00080016']),
      sopInstanceUID: getValue(metaData['00080018']),
    };
  }

  if (type === 'petIsotopeModule') {
    const radiopharmaceuticalInfo = getValue(metaData['00540016']);

    if (radiopharmaceuticalInfo === undefined) {
      return;
    }

    return {
      radiopharmaceuticalInfo: {
        radiopharmaceuticalStartTime: dicomParser.parseTM(
          getValue(radiopharmaceuticalInfo['00181072'], 0, '')
        ),
        radionuclideTotalDose: getNumberValue(
          radiopharmaceuticalInfo['00181074']
        ),
        radionuclideHalfLife: getNumberValue(
          radiopharmaceuticalInfo['00181075']
        ),
      },
    };
  }

  if (type === 'overlayPlaneModule') {
    return getOverlayPlaneModule(metaData);
  }

  // Note: this is not a DICOM module, but a useful metadata that can be
  // retrieved from the image
  if (type === 'transferSyntax') {
    return {
      transferSyntaxUID: getValue(metaData['00020010']),
    };
  }

  if (type === 'petSeriesModule') {
    return {
      correctedImage: getValue(metaData['00280051']),
      units: getValue(metaData['00541001']),
      decayCorrection: getValue(metaData['00541102']),
    };
  }

  if (type === 'petImageModule') {
    return {
      frameReferenceTime: getNumberValue(metaData['00541300']),
      actualFrameDuration: getNumberValue(metaData['00181242']),
    };
  }
}

export default metaDataProvider;
