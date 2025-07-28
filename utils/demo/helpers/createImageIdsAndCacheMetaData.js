import { api } from 'dicomweb-client';
import dcmjs from 'dcmjs';
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv';
import { getPTImageIdInstanceMetadata } from './getPTImageIdInstanceMetadata';
import { utilities } from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

import ptScalingMetaDataProvider from './ptScalingMetaDataProvider';
import { convertMultiframeImageIds } from './convertMultiframeImageIds';
import removeInvalidTags from './removeInvalidTags';

const { DicomMetaDictionary } = dcmjs.data;
const { calibratedPixelSpacingMetadataProvider, getPixelSpacingInformation } =
  utilities;

/**
/**
 * Uses dicomweb-client to fetch metadata of a study, cache it in cornerstone,
 * and return a list of imageIds for the frames.
 *
 * Uses the app config to choose which study to fetch, and which
 * dicom-web server to fetch it from.
 *
 * @returns {string[]} An array of imageIds for instances in the study.
 */

export async function createImageIdsAndCacheMetaData({
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID = null,
  wadoRsRoot,
  client = null,
  convertMultiframe = true,
}) {
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';
  const MODALITY = '00080060';

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

    cornerstoneDICOMImageLoader.wadors.metaDataManager.add(
      imageId,
      instanceMetaData
    );
    return imageId;
  });

  // if the image ids represent multiframe information, creates a new list with one image id per frame
  // if not multiframe data available, just returns the same list given
  if (convertMultiframe) {
    imageIds = convertMultiframeImageIds(imageIds);
  }

  imageIds.forEach((imageId) => {
    let instanceMetaData =
      cornerstoneDICOMImageLoader.wadors.metaDataManager.get(imageId);

    if (!instanceMetaData) {
      return;
    }

    // It was using JSON.parse(JSON.stringify(...)) before but it is 8x slower
    instanceMetaData = removeInvalidTags(instanceMetaData);

    if (instanceMetaData) {
      // Add calibrated pixel spacing
      const metadata = DicomMetaDictionary.naturalizeDataset(instanceMetaData);
      const pixelSpacingInformation = getPixelSpacingInformation(metadata);
      const pixelSpacing = pixelSpacingInformation?.PixelSpacing;

      if (pixelSpacing) {
        calibratedPixelSpacingMetadataProvider.add(imageId, {
          rowPixelSpacing: parseFloat(pixelSpacing[0]),
          columnPixelSpacing: parseFloat(pixelSpacing[1]),
          type: pixelSpacingInformation.type,
        });
      }
    }
  });

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

export async function createImageIdsAndCacheMetaData2({
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID = null,
  wadoRsRoot,
  client = null,
  convertMultiframe = false,
}) {
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';
  const MODALITY = '00080060';
  const PATIENT_POSITION = '00185100';
  const INSTANCE_NUMBER = '00200013';
  const instanceNumbers = [];

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
  let patientPosition = 'HFS';
  if (instances[0]?.[PATIENT_POSITION]?.Value?.[0]) {
    patientPosition = instances[0][PATIENT_POSITION].Value[0]; // Use metadata value
  }
  const sortedInstances = Object.values(instances).sort(
    (a, b) => b['00200013'].Value[0] - a['00200013'].Value[0]
  );
  let imageIds = sortedInstances.map((instanceMetaData) => {
    const SeriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0];
    const SOPInstanceUIDToUse =
      SOPInstanceUID || instanceMetaData[SOP_INSTANCE_UID].Value[0];
    const instanceNumber = instanceMetaData[INSTANCE_NUMBER].Value[0];
    instanceNumbers.push(Number(instanceNumber));
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

    cornerstoneDICOMImageLoader.wadors.metaDataManager.add(
      imageId,
      instanceMetaData
    );
    return imageId;
  });
  // using instance number to identify gap in discontinues series
  const gaps = findGapIndexRanges(instanceNumbers);
  // if the image ids represent multiframe information, creates a new list with one image id per frame
  // if not multiframe data available, just returns the same list given
  if (convertMultiframe) {
    imageIds = convertMultiframeImageIds(imageIds);
  }

  imageIds.forEach((imageId) => {
    let instanceMetaData =
      cornerstoneDICOMImageLoader.wadors.metaDataManager.get(imageId);

    if (!instanceMetaData) {
      return;
    }

    // It was using JSON.parse(JSON.stringify(...)) before but it is 8x slower
    instanceMetaData = removeInvalidTags(instanceMetaData);

    if (instanceMetaData) {
      // Add calibrated pixel spacing
      const metadata = DicomMetaDictionary.naturalizeDataset(instanceMetaData);
      const pixelSpacingInformation = getPixelSpacingInformation(metadata);
      const pixelSpacing = pixelSpacingInformation?.PixelSpacing;

      if (pixelSpacing) {
        calibratedPixelSpacingMetadataProvider.add(imageId, {
          rowPixelSpacing: parseFloat(pixelSpacing[0]),
          columnPixelSpacing: parseFloat(pixelSpacing[1]),
          type: pixelSpacingInformation.type,
        });
      }
    }
  });

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

  return { imageIds, patientPosition, gaps };
}

function findGapIndexRanges(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return [];
  }

  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const gaps = [];

  let expectedIndex = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const gapSize = curr - prev - 1;

    if (gapSize > 0) {
      const gapStartIndex = expectedIndex + 1;
      const gapEndIndex = expectedIndex + gapSize;
      gaps.push([gapStartIndex, gapEndIndex]);
    }

    expectedIndex += curr - prev;
  }

  return gaps;
}
