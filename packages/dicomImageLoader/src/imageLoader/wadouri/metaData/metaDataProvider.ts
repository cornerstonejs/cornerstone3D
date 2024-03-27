import external from '../../../externalModules';
import getNumberValues from './getNumberValues';
import parseImageId from '../parseImageId';
import dataSetCacheManager from '../dataSetCacheManager';
import getImagePixelModule from './getImagePixelModule';
import getOverlayPlaneModule from './getOverlayPlaneModule';
import getLUTs from './getLUTs';
import getModalityLUTOutputPixelRepresentation from './getModalityLUTOutputPixelRepresentation';
import { getDirectFrameInformation } from '../combineFrameInstanceDataset';
import multiframeDataset from '../retrieveMultiframeDataset';
import {
  getImageTypeSubItemFromDataset,
  extractOrientationFromDataset,
  extractPositionFromDataset,
  extractSpacingFromDataset,
  extractSliceThicknessFromDataset,
} from './extractPositioningFromDataset';
import isNMReconstructable from '../../isNMReconstructable';
import {
  getInstanceModule,
  instanceModuleNames,
} from '../../getInstanceModule';

function metaDataProvider(type, imageId) {
  const { MetadataModules } = external.cornerstone.Enums;
  const { dicomParser } = external;

  // Several providers use array queries
  if (Array.isArray(imageId)) {
    return;
  }

  const parsedImageId = parseImageId(imageId);

  if (type === MetadataModules.MULTIFRAME) {
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

  let url = parsedImageId.url;

  if (parsedImageId.frame) {
    url = `${url}&frame=${parsedImageId.frame}`;
  }

  const dataSet = dataSetCacheManager.get(url);

  if (!dataSet) {
    return;
  }

  if (type === MetadataModules.GENERAL_STUDY) {
    return {
      studyDescription: dataSet.string('x00081030'),
      studyDate: dicomParser.parseDA(dataSet.string('x00080020')),
      studyTime: dicomParser.parseTM(dataSet.string('x00080030') || ''),
      accessionNumber: dataSet.string('x00080050'),
    };
  }

  if (type === MetadataModules.GENERAL_SERIES) {
    return {
      modality: dataSet.string('x00080060'),
      seriesInstanceUID: dataSet.string('x0020000e'),
      seriesNumber: dataSet.intString('x00200011'),
      studyInstanceUID: dataSet.string('x0020000d'),
      seriesDate: dicomParser.parseDA(dataSet.string('x00080021')),
      seriesTime: dicomParser.parseTM(dataSet.string('x00080031') || ''),
      acquisitionDate: dicomParser.parseDA(dataSet.string('x00080022')),
      acquisitionTime: dicomParser.parseTM(dataSet.string('x00080032') || ''),
    };
  }

  if (type === MetadataModules.GENERAL_IMAGE) {
    return {
      sopInstanceUID: dataSet.string('x00080018'),
      instanceNumber: dataSet.intString('x00200013'),
      lossyImageCompression: dataSet.string('x00282110'),
      lossyImageCompressionRatio: dataSet.floatString('x00282112'),
      lossyImageCompressionMethod: dataSet.string('x00282114'),
    };
  }

  if (type === MetadataModules.PATIENT) {
    return {
      patientID: dataSet.string('x00100020'),
      patientName: dataSet.string('x00100010'),
    };
  }

  if (type === MetadataModules.PATIENT_STUDY) {
    return {
      patientAge: dataSet.intString('x00101010'),
      patientSize: dataSet.floatString('x00101020'),
      patientSex: dataSet.string('x00100040'),
      patientWeight: dataSet.floatString('x00101030'),
    };
  }

  if (type === MetadataModules.NM_MULTIFRAME_GEOMETRY) {
    const modality = dataSet.string('x00080060');
    const imageSubType = getImageTypeSubItemFromDataset(dataSet, 2);

    return {
      modality,
      imageType: dataSet.string('x00080008'),
      imageSubType,
      imageOrientationPatient: extractOrientationFromDataset(dataSet),
      imagePositionPatient: extractPositionFromDataset(dataSet),
      sliceThickness: extractSliceThicknessFromDataset(dataSet),
      pixelSpacing: extractSpacingFromDataset(dataSet),
      numberOfFrames: dataSet.uint16('x00280008'),
      isNMReconstructable:
        isNMReconstructable(imageSubType) && modality.includes('NM'),
    };
  }

  if (type === MetadataModules.IMAGE_PLANE) {
    const imageOrientationPatient = extractOrientationFromDataset(dataSet);
    const imagePositionPatient = extractPositionFromDataset(dataSet);
    const pixelSpacing = extractSpacingFromDataset(dataSet);
    const sliceThickness = extractSliceThicknessFromDataset(dataSet);

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
        // @ts-expect-error
        parseFloat(imageOrientationPatient[0]),
        // @ts-expect-error
        parseFloat(imageOrientationPatient[1]),
        // @ts-expect-error
        parseFloat(imageOrientationPatient[2]),
      ];
      columnCosines = [
        // @ts-expect-error
        parseFloat(imageOrientationPatient[3]),
        // @ts-expect-error
        parseFloat(imageOrientationPatient[4]),
        // @ts-expect-error
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
      sliceThickness,
      sliceLocation: dataSet.floatString('x00201041'),
      pixelSpacing,
      rowPixelSpacing,
      columnPixelSpacing,
    };
  }

  if (type === MetadataModules.CINE) {
    return {
      frameTime: dataSet.floatString('x00181063'),
    };
  }

  if (type === MetadataModules.IMAGE_PIXEL) {
    return getImagePixelModule(dataSet);
  }

  if (type === MetadataModules.VOI_LUT) {
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

  if (type === MetadataModules.MODALITY_LUT) {
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

  if (type === MetadataModules.SOP_COMMON) {
    return {
      sopClassUID: dataSet.string('x00080016'),
      sopInstanceUID: dataSet.string('x00080018'),
    };
  }

  if (type === MetadataModules.PET_ISOTOPE) {
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

  if (type === MetadataModules.OVERLAY_PLANE) {
    return getOverlayPlaneModule(dataSet);
  }

  // Note: this is not a DICOM module, but a useful metadata that can be
  // retrieved from the image
  if (type === 'transferSyntax') {
    return {
      transferSyntaxUID: dataSet.string('x00020010'),
    };
  }

  if (type === MetadataModules.PET_SERIES) {
    return {
      correctedImage: dataSet.string('x00280051'),
      units: dataSet.string('x00541001'),
      decayCorrection: dataSet.string('x00541102'),
    };
  }

  if (type === MetadataModules.PET_IMAGE) {
    return {
      frameReferenceTime: dataSet.floatString(
        dataSet.string('x00541300') || ''
      ),
      actualFrameDuration: dataSet.intString(dataSet.string('x00181242')),
    };
  }

  // Note: this is not a DICOM module, but rather an aggregation on all others
  if (type === 'instance') {
    return getInstanceModule(imageId, metaDataProvider, instanceModuleNames);
  }
}

export default metaDataProvider;
