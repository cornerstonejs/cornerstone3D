import { metaData, Enums, type Types } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

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
};

console.warn('Registering metadata provider for referenced info');
metaData.addProvider(metadataProvider.get, 9023);
