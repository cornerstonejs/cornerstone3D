import { api } from 'dicomweb-client';
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv';
import { getPTImageIdInstanceMetadata } from './getPTImageIdInstanceMetadata';
import { utilities, metaData } from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import {
  utilities as metadataUtilities,
  Enums as metadataEnums,
} from '@cornerstonejs/metadata';

import ptScalingMetaDataProvider from './ptScalingMetaDataProvider';
import { convertMultiframeImageIds } from './convertMultiframeImageIds';

const { calibratedPixelSpacingMetadataProvider, getPixelSpacingInformation } =
  utilities;

const { addDicomwebInstance, setCacheData, Tag } = metadataUtilities;
const { MetadataModules } = metadataEnums;

const SOP_INSTANCE_UID = Tag.lookupTagHex('SOPInstanceUID');
const SERIES_INSTANCE_UID = Tag.lookupTagHex('SeriesInstanceUID');
const MODALITY = Tag.lookupTagHex('Modality');

/**
/**
 * Uses dicomweb-client to fetch metadata of a study, cache it in cornerstone,
 * and return a list of imageIds for the frames.
 *
 * Uses the app config to choose which study to fetch, and which
 * dicom-web server to fetch it from.
 *
 * @param {object} options
 * @param {boolean} [options.useMetadata=true] - Store instances in the new typed metadata framework
 * @param {boolean} [options.useLegacyWadoRs=true] - Store instances in the legacy wadors metaDataManager
 * @returns {string[]} An array of imageIds for instances in the study.
 */

export default async function createImageIdsAndCacheMetaData({
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID = null,
  wadoRsRoot,
  client = null,
  convertMultiframe = true,
  useMetadata = true,
  useLegacyWadoRs = true,
}) {

  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
    seriesInstanceUID: SeriesInstanceUID,
  };

  client = client || new api.DICOMwebClient({ url: wadoRsRoot });
  let instances = await client.retrieveSeriesMetadata(studySearchOptions);

  // if sop instance is provided we should filter the instances to only include the one we want
  if (SOPInstanceUID) {
    instances = instances.filter((instance) => {
      return instance[SOP_INSTANCE_UID].Value[0] === SOPInstanceUID;
    });
  }

  const modality = instances[0][MODALITY].Value[0];
  let imageIds = instances.map((instanceMetaData) => {
    const SeriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0];
    const SOPInstanceUIDToUse =
      SOPInstanceUID || instanceMetaData[SOP_INSTANCE_UID].Value[0];

    const prefix = 'wadors:';

    const imageId =
      prefix +
      wadoRsRoot +
      '/studies/' +
      StudyInstanceUID.trim() +
      '/series/' +
      SeriesInstanceUID.trim() +
      '/instances/' +
      SOPInstanceUIDToUse.trim() +
      '/frames/1';

    if (useLegacyWadoRs) {
      cornerstoneDICOMImageLoader.wadors.metaDataManager.add(
        imageId,
        instanceMetaData
      );
    }

    if (useMetadata) {
      addDicomwebInstance(imageId, instanceMetaData);
    }

    return imageId;
  });

  // if the image ids represent multiframe information, creates a new list with one image id per frame
  // if not multiframe data available, just returns the same list given
  if (convertMultiframe) {
    const originalImageIds = [...imageIds];
    imageIds = convertMultiframeImageIds(imageIds);

    // For multiframe expansions, store INSTANCE_ORIG for each frame imageId
    if (useMetadata && imageIds.length !== originalImageIds.length) {
      for (const imageId of imageIds) {
        if (metaData.get('instanceOrig', imageId)) {
          continue;
        }
        const frameIdx = imageId.lastIndexOf('/frames/');
        if (frameIdx >= 0) {
          const baseImageId = imageId.substring(0, frameIdx) + '/frames/1';
          const baseInstance = metaData.get('instanceOrig', baseImageId);
          if (baseInstance) {
            setCacheData(
              MetadataModules.INSTANCE_ORIG,
              imageId,
              baseInstance
            );
          }
        }
      }
    }
  }

  if (useMetadata) {
    imageIds.forEach((imageId) => {
      const instance = metaData.get('instanceOrig', imageId);

      if (!instance) {
        return;
      }

      // Add calibrated pixel spacing from the naturalized instance
      const pixelSpacingInformation = getPixelSpacingInformation(instance);
      const pixelSpacing = pixelSpacingInformation?.PixelSpacing;

      if (pixelSpacing) {
        calibratedPixelSpacingMetadataProvider.add(imageId, {
          rowPixelSpacing: parseFloat(pixelSpacing[0]),
          columnPixelSpacing: parseFloat(pixelSpacing[1]),
          type: pixelSpacingInformation.type,
        });
      }
    });
  }

  // we don't want to add non-pet
  // Note: for 99% of scanners SUV calculation is consistent bw slices
  if (modality === 'PT') {
    const InstanceMetadataArray = [];
    imageIds.forEach((imageId) => {
      const instanceMetadata = getPTImageIdInstanceMetadata(imageId);

      // TODO: Temporary fix because static-wado is producing a string, not an array of values
      // (or maybe dcmjs isn't parsing it correctly?)
      // It's showing up like 'DECY\\ATTN\\SCAT\\DTIM\\RAN\\RADL\\DCAL\\SLSENS\\NORM'
      // but calculate-suv expects ['DECY', 'ATTN', ...]
      if (typeof instanceMetadata.CorrectedImage === 'string') {
        instanceMetadata.CorrectedImage =
          instanceMetadata.CorrectedImage.split('\\');
      }

      if (instanceMetadata) {
        InstanceMetadataArray.push(instanceMetadata);
      }
    });
    if (InstanceMetadataArray.length) {
      try {
        const suvScalingFactors = calculateSUVScalingFactors(
          InstanceMetadataArray
        );
        InstanceMetadataArray.forEach((instanceMetadata, index) => {
          ptScalingMetaDataProvider.addInstance(
            imageIds[index],
            suvScalingFactors[index]
          );
        });
      } catch (error) {
        console.log(error);
      }
    }
  }

  return imageIds;
}
