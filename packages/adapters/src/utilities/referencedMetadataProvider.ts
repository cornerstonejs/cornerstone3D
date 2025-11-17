import { metaData, Enums, type Types } from '@cornerstonejs/core';
import dcmjs from 'dcmjs';

import {
  metaSRAnnotation,
  metaRTSSContour,
} from '../adapters/Cornerstone3D/constants';

const { DicomMetaDictionary } = dcmjs.data;
const { MetadataModules } = Enums;

export const STUDY_MODULES = [
  MetadataModules.GENERAL_STUDY,
  MetadataModules.PATIENT_STUDY,
  MetadataModules.PATIENT,
];

export const SERIES_MODULES = [MetadataModules.GENERAL_SERIES];

export const IMAGE_MODULES = [
  MetadataModules.GENERAL_IMAGE,
  MetadataModules.IMAGE_PLANE,
  MetadataModules.CINE,
  MetadataModules.VOI_LUT,
  MetadataModules.MODALITY_LUT,
  MetadataModules.SOP_COMMON,
];

/**
 * Contains a metadata provider which knows how to generate different types of
 * referenced metadata for things like creation a reference to an existing
 * image, creating a new DICOM object entirely etc.
 *
 * There are also specific study/series/instance level attribute getters which
 * can be used to get the attributes at a given level in the Normalized format
 * instead of the lowerCamelCase format.  This assists in creating new DICOM
 * objects.
 *
 * For example, this module provides a `ImageSopInstanceReference` implementation
 * based on 'sopCommonModule' and 'frameModule' which references an image correctly
 */

export const metadataProvider = {
  get: function (type: string, imageId: string, options) {
    return metadataProvider[type]?.(imageId, options);
  },

  /**
   * Returns an image sop instance reference for the given image, based on the
   * frame module metadata.
   * Note: UpperCamelCase for normalized response.
   */
  [MetadataModules.IMAGE_SOP_INSTANCE_REFERENCE]: function (imageId: string) {
    const frameModule = metaData.get(MetadataModules.FRAME_MODULE, imageId);
    const { sopClassUID, sopInstanceUID, frameNumber, numberOfFrames } =
      frameModule;
    if (numberOfFrames > 1) {
      return {
        ReferencedSOPClassUID: sopClassUID,
        ReferencedSOPInstanceUID: sopInstanceUID,
        ReferencedFrameNumber: frameNumber,
      };
    }
    return {
      ReferencedSOPClassUID: frameModule.sopClassUID,
      ReferencedSOPInstanceUID: frameModule.sopInstanceUID,
    };
  },

  /**
   * Returns a referenced series reference for the given image id
   * NOTE: This will often not be unique, so it needs to get added
   * appropriately to a full list object.
   */
  [MetadataModules.REFERENCED_SERIES_REFERENCE]: (imageId) => {
    const sopModule = metaData.get(MetadataModules.SOP_COMMON, imageId);
    const seriesModule = metaData.get(MetadataModules.GENERAL_SERIES, imageId);

    return {
      SeriesInstanceUID: seriesModule.seriesInstanceUID,
      ReferencedInstanceSequence: [
        {
          ReferencedSOPClassUID: sopModule.sopClassUID,
          ReferencedSOPInstanceUID: sopModule.sopInstanceUID,
        },
      ],
    };
  },

  /**
   * Returns a predecessor sequence and related information to apply
   * to the generated object.
   */
  [MetadataModules.PREDECESSOR_SEQUENCE]: (imageId) => {
    // Start with the series data
    const result = { ...metaData.get(MetadataModules.SERIES_DATA, imageId) };
    // And extend with the predecessor information, plus updates for a new
    // instance.
    const generalImage = metaData.get(MetadataModules.GENERAL_IMAGE, imageId);
    const study = metaData.get(MetadataModules.GENERAL_STUDY, imageId);
    result.InstanceNumber = 1 + Number(generalImage.instanceNumber);
    result.PredecessorDocumentsSequence = {
      StudyInstanceUID: study.studyInstanceUID,
      ReferencedSeriesSequence: {
        SeriesInstanceUID: result.SeriesInstanceUID,
        ReferencedSOPSequence: {
          ReferencedSOPClassUID: generalImage.sopClassUID,
          ReferencedSOPInstanceUID: generalImage.sopInstanceUID,
        },
      },
    };
    return result;
  },

  /**
   * Returns a Study header instance data for a given image.
   */
  [MetadataModules.STUDY_DATA]: (imageId) => {
    return metaData.getNormalizedModule(imageId, STUDY_MODULES);
  },
  /**
   * Returns a Series only header instance data for a given image.
   */
  [MetadataModules.SERIES_DATA]: (imageId) => {
    return metaData.getNormalizedModule(imageId, SERIES_MODULES);
  },
  /**
   * Returns a Study header instance data for a given image.
   */
  [MetadataModules.IMAGE_DATA]: (imageId) => {
    return metaData.getNormalizedModule(imageId, IMAGE_MODULES);
  },

  /**
   * RTSS Instance metadata
   */
  [MetadataModules.RTSS_INSTANCE_DATA]: (imageId) => {
    const newInstanceData = metaData.get(
      MetadataModules.NEW_INSTANCE_DATA,
      imageId
    );
    return {
      ...newInstanceData,
      // Put the RTSS after SR and SEG instances, so in the 3200 series
      // Should be replaced externally
      SeriesNumber: '3201',
      StructureSetROISequence: [],
      ROIContourSequence: [],
      RTROIObservationsSequence: [],
      ReferencedFrameOfReferenceSequence: [],
      Modality: 'RTSTRUCT',
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.481.3', // RT Structure Set Storage
      PositionReferenceIndicator: '',
      StructureSetLabel: '',
      StructureSetName: '',
      StructureSetDate: DicomMetaDictionary.date(),
      StructureSetTime: DicomMetaDictionary.time(),
    };
  },

  [MetadataModules.NEW_INSTANCE_DATA]: (imageId) => {
    const studyData = metaData.get(MetadataModules.STUDY_DATA, imageId);
    return {
      ...studyData,
      // Just a garbage series number as this should be replaced elsewhere
      SeriesNumber: '50000',
      InstanceNumber: '1',
      OperatorsName: '',
      ReferringPhysicianName: '',
      SpecificCharacterSet: 'ISO_IR 192',
      Manufacturer: 'cs3d',
      SOPInstanceUID: DicomMetaDictionary.uid(),
      SeriesInstanceUID: DicomMetaDictionary.uid(),
    };
  },

  [MetadataModules.RTSS_CONTOUR]: () => metaRTSSContour,
  [MetadataModules.SR_ANNOTATION]: () => metaSRAnnotation,
};

metaData.addProvider(metadataProvider.get, 9023);
