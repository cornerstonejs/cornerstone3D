import { metaData, Enums, type Types } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

export const STUDY_MODULES = [
  MetadataModules.GENERAL_STUDY,
  MetadataModules.PATIENT,
  MetadataModules.PATIENT_STUDY,
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
 * Contains a metadata provider which knows how to generate the various referenced
 * metadata instances based on the existing metadata modules.
 *
 * For example, this module provides a `ImageSopInstanceReference` implementation
 * based on 'sopCommonModule' and 'frameModule'
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
    const result = { ...metaData.get(MetadataModules.SERIES_DATA) };
    // And extend with the predecessor information, plus updates for a new
    // instance.
    const generalImage = metaData.get(MetadataModules.GENERAL_IMAGE);
    const study = metaData.get(MetadataModules.GENERAL_STUDY);
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
    return metaData.getInstanceModule(imageId, STUDY_MODULES);
  },
  /**
   * Returns a Series only header instance data for a given image.
   */
  [MetadataModules.SERIES_DATA]: (imageId) => {
    return metaData.getInstanceModule(imageId, SERIES_MODULES);
  },
  /**
   * Returns a Study header instance data for a given image.
   */
  [MetadataModules.IMAGE_DATA]: (imageId) => {
    return metaData.getInstanceModule(imageId, IMAGE_MODULES);
  },
};

metaData.addProvider(metadataProvider.get, 9023);
