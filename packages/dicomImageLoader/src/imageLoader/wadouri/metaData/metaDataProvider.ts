import { Enums, metaData } from '@cornerstonejs/core';
import * as dicomParser from 'dicom-parser';
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
import { instanceModuleNames } from '../../getInstanceModule';
import { getUSEnhancedRegions } from './USHelpers';

function metaDataProvider(type, imageId) {
  const { MetadataModules } = Enums;

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

  return metadataForDataset(type, imageId, dataSet);
}

export function metadataForDataset(
  type,
  imageId,
  dataSet: dicomParser.DataSet
) {
  const { MetadataModules } = Enums;

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
      voiLUTFunction: dataSet.string('x00281056'),
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
    let transferSyntaxUID;

    try {
      transferSyntaxUID = dataSet.string('x00020010');
    } catch (error) {
      // Do nothing
    }

    return {
      transferSyntaxUID,
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

  if (type === MetadataModules.ULTRASOUND_ENHANCED_REGION) {
    return getUSEnhancedRegions(dataSet);
  }

  if (type === MetadataModules.CALIBRATION) {
    const modality = dataSet.string('x00080060');
    if (modality === 'US') {
      const enhancedRegion = getUSEnhancedRegions(dataSet);
      return {
        sequenceOfUltrasoundRegions: enhancedRegion,
      };
    }
  }

  // Note: this is not a DICOM module, but rather an aggregation on all others
  if (type === 'instance') {
    return metaData.getNormalized(imageId, instanceModuleNames);
  }
}

export default metaDataProvider;
