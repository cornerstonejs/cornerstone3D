import { eventTarget, imageLoader, triggerEvent } from '@cornerstonejs/core';
import { utilities as cstUtils } from '@cornerstonejs/tools';
import ndarray from 'ndarray';
import checkOrientation from '../../helpers/checkOrientation';
import {
  alignPixelDataWithSourceData,
  calculateCentroid,
  findReferenceSourceImageId,
  getSegmentIndex,
  getSegmentMetadata,
  getValidOrientations,
  readFromUnpackedChunks,
} from '../../Cornerstone/Segmentation_4X';
import { compactMergeSegmentDataWithoutInformationLoss } from './compactMergeSegData';
import { Events } from '../../enums';

const updateSegmentsOnFrame = ({
  segmentsOnFrame,
  imageIdIndex,
  segmentIndex,
}) => {
  if (!segmentsOnFrame[imageIdIndex]) {
    segmentsOnFrame[imageIdIndex] = [];
  }

  segmentsOnFrame[imageIdIndex].push(segmentIndex);
};

const updateSegmentsPixelIndices = ({
  segmentsPixelIndices,
  segmentIndex,
  imageIdIndex,
  indexCache,
}) => {
  if (!segmentsPixelIndices.has(segmentIndex)) {
    segmentsPixelIndices.set(segmentIndex, {});
  }
  const segmentIndexObject = segmentsPixelIndices.get(segmentIndex);
  segmentIndexObject[imageIdIndex] = indexCache;
  segmentsPixelIndices.set(segmentIndex, segmentIndexObject);
};

const extractInfoFromPerFrameFunctionalGroups = ({
  PerFrameFunctionalGroups,
  sequenceIndex,
  sopUIDImageIdIndexMap,
  multiframe,
}) => {
  const referencedSOPInstanceUid =
    PerFrameFunctionalGroups.DerivationImageSequence[0].SourceImageSequence[0]
      .ReferencedSOPInstanceUID;
  const referencedImageId = sopUIDImageIdIndexMap[referencedSOPInstanceUid];
  const segmentIndex = getSegmentIndex(multiframe, sequenceIndex);

  return { referencedSOPInstanceUid, referencedImageId, segmentIndex };
};

/**
 * Creates labelmap images from a SEG instance identified by segImageId.
 * Uses metadataProvider.get('instance', segImageId) for the naturalized SEG dataset
 * and imageLoader.loadImage(segImageId) for uncompressed pixel data.
 *
 * @param referencedImageIds - Referenced image IDs (e.g. CT/MR series)
 * @param segImageId - Image ID for the SEG instance (loadable via imageLoader)
 * @param metadataProvider - Provider for instance metadata (must return naturalized dataset for segImageId)
 * @param options - { tolerance, TypedArrayConstructor, maxBytesPerChunk }
 */
async function createLabelmapsFromBufferInternal(
  referencedImageIds,
  segImageId,
  metadataProvider,
  options
) {
  const { tolerance = 1e-3, TypedArrayConstructor = Uint8Array } =
    options ?? {};

  const instanceMeta = metadataProvider.get('instance', segImageId);
  if (!instanceMeta) {
    throw new Error(
      `No instance metadata found for SEG imageId: ${segImageId}. Ensure the SEG instance is registered in the metadata provider (e.g. after loading the image).`
    );
  }
  const multiframe = instanceMeta.dataset ?? instanceMeta;

  const imagePlaneModule = metadataProvider.get(
    'imagePlaneModule',
    referencedImageIds[0]
  );

  const generalSeriesModule = metadataProvider.get(
    'generalSeriesModule',
    referencedImageIds[0]
  );

  const SeriesInstanceUID = generalSeriesModule.seriesInstanceUID;

  if (!imagePlaneModule) {
    console.warn('Insufficient metadata, imagePlaneModule missing.');
  }

  const ImageOrientationPatient = Array.isArray(imagePlaneModule.rowCosines)
    ? [...imagePlaneModule.rowCosines, ...imagePlaneModule.columnCosines]
    : [
        imagePlaneModule.rowCosines.x,
        imagePlaneModule.rowCosines.y,
        imagePlaneModule.rowCosines.z,
        imagePlaneModule.columnCosines.x,
        imagePlaneModule.columnCosines.y,
        imagePlaneModule.columnCosines.z,
      ];

  const validOrientations = getValidOrientations(ImageOrientationPatient);
  const segMetadata = getSegmentMetadata(multiframe, SeriesInstanceUID);

  const image = await imageLoader.loadImage(segImageId);
  if (!image || typeof image.getPixelData !== 'function') {
    throw new Error(
      'SEG image load did not return an image with getPixelData(). Ensure a SEG-capable image loader is registered for this imageId.'
    );
  }
  const pixelData = image.getPixelData();
  const pixelDataChunks = Array.isArray(pixelData) ? pixelData : [pixelData];

  const orientation = checkOrientation(
    multiframe,
    validOrientations,
    [
      imagePlaneModule.rows,
      imagePlaneModule.columns,
      referencedImageIds.length,
    ],
    tolerance
  );

  // Pre-compute the sop UID to imageId index map so that in the for loop
  // we don't have to call metadataProvider.get() for each imageId over
  // and over again.
  const sopUIDImageIdIndexMap = referencedImageIds.reduce((acc, imageId) => {
    const { sopInstanceUID } = metadataProvider.get(
      'generalImageModule',
      imageId
    );
    acc[sopInstanceUID] = imageId;
    return acc;
  }, {});

  let insertFunction;

  switch (orientation) {
    case 'Planar':
      insertFunction = insertPixelDataPlanar;
      break;
    case 'Perpendicular':
      throw new Error(
        'Segmentations orthogonal to the acquisition plane of the source data are not yet supported.'
      );
    case 'Oblique':
      throw new Error(
        'Segmentations oblique to the acquisition plane of the source data are not yet supported.'
      );
  }

  /* if SEGs are overlapping:
    1) the labelmapBuffer will contain M volumes which have non-overlapping segments;
    2) segmentsOnFrame will have M * numberOfFrames values to track in which labelMap are the segments;
    3) insertFunction will return the number of LabelMaps
    4) generateToolState return is an array*/

  const segmentsOnFrame = [];

  const imageIdMaps = { indices: {}, metadata: {} };
  const labelMapImages = [];

  for (let i = 0; i < referencedImageIds.length; i++) {
    const referenceImageId = referencedImageIds[i];
    imageIdMaps.indices[referenceImageId] = i;
    imageIdMaps.metadata[referenceImageId] = metadataProvider.get(
      'instance',
      referenceImageId
    );
    const labelMapImage =
      imageLoader.createAndCacheDerivedLabelmapImage(referenceImageId);
    labelMapImages.push(labelMapImage);
  }

  // This is the centroid calculation for each segment Index, the data structure
  // is a Map with key = segmentIndex and value = {imageIdIndex: centroid, ...}
  // later on we will use this data structure to calculate the centroid of the
  // segment in the labelmapBuffer
  const segmentsPixelIndices = new Map();

  const { hasOverlappingSegments, arrayOfLabelMapImages } =
    await insertFunction({
      segmentsOnFrame,
      labelMapImages,
      pixelDataChunks,
      multiframe,
      referencedImageIds,
      validOrientations,
      metadataProvider,
      tolerance,
      segmentsPixelIndices,
      sopUIDImageIdIndexMap,
      imageIdMaps,
      TypedArrayConstructor,
    });

  // calculate the centroid of each segment
  const centroidXYZ = new Map();

  segmentsPixelIndices.forEach((imageIdIndexBufferIndex, segmentIndex) => {
    const centroids = calculateCentroid(
      imageIdIndexBufferIndex,
      multiframe,
      metadataProvider,
      referencedImageIds
    );

    centroidXYZ.set(segmentIndex, centroids);
  });

  return {
    labelMapImages: arrayOfLabelMapImages,
    segMetadata,
    segmentsOnFrame,
    centroids: centroidXYZ,
    overlappingSegments: hasOverlappingSegments,
  };
}

const throttledTriggerLoadProgressEvent = cstUtils.throttle(
  (percentComplete) => {
    triggerEvent(eventTarget, Events.SEGMENTATION_LOAD_PROGRESS, {
      percentComplete,
    });
  },
  200
);

export function insertPixelDataPlanar({
  segmentsOnFrame,
  labelMapImages,
  pixelDataChunks,
  multiframe,
  referencedImageIds,
  validOrientations,
  metadataProvider,
  tolerance,
  segmentsPixelIndices,
  sopUIDImageIdIndexMap,
  imageIdMaps,
}) {
  const {
    SharedFunctionalGroupsSequence,
    PerFrameFunctionalGroupsSequence,
    Rows,
    Columns,
  } = multiframe;

  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence.PlaneOrientationSequence
      ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
          .ImageOrientationPatient
      : undefined;
  const sliceLength = Columns * Rows;

  const groupsLen = PerFrameFunctionalGroupsSequence.length;

  let overlapping = false;
  // Below, we chunk the processing of the frames to avoid blocking the main thread
  // if the segmentation is large. We also use a promise to allow the caller to
  // wait for the processing to finish.
  return new Promise((resolve) => {
    const percentImagesPerChunk = 0.1;
    const imagesPerChunk = Math.ceil(groupsLen * percentImagesPerChunk);
    const processChunk = (firstIndex) => {
      for (
        let i = firstIndex;
        i < firstIndex + imagesPerChunk && i < groupsLen;
        i++
      ) {
        const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        const ImageOrientationPatientI =
          sharedImageOrientationPatient ||
          PerFrameFunctionalGroups.PlaneOrientationSequence
            .ImageOrientationPatient;

        const view = readFromUnpackedChunks(
          pixelDataChunks,
          i * sliceLength,
          sliceLength
        );

        const pixelDataI2D = ndarray(view, [Rows, Columns]);

        const alignedPixelDataI = alignPixelDataWithSourceData(
          pixelDataI2D,
          ImageOrientationPatientI,
          validOrientations,
          tolerance
        );

        if (!alignedPixelDataI) {
          throw new Error(
            'Individual SEG frames are out of plane with respect to the first SEG frame. ' +
              'This is not yet supported. Aborting segmentation loading.'
          );
        }

        const segmentIndex = getSegmentIndex(multiframe, i);

        if (segmentIndex === undefined) {
          throw new Error(
            'Could not retrieve the segment index. Aborting segmentation loading.'
          );
        }

        if (!segmentsPixelIndices.has(segmentIndex)) {
          segmentsPixelIndices.set(segmentIndex, {});
        }

        const imageId = findReferenceSourceImageId(
          multiframe,
          i,
          referencedImageIds,
          metadataProvider,
          tolerance,
          sopUIDImageIdIndexMap
        );

        if (!imageId) {
          console.warn(
            "Image not present in stack, can't import frame : " + i + '.'
          );
          return;
        }

        const sourceImageMetadata = imageIdMaps.metadata[imageId];
        if (
          Rows !== sourceImageMetadata.Rows ||
          Columns !== sourceImageMetadata.Columns
        ) {
          throw new Error(
            'Individual SEG frames have different geometry dimensions (Rows and Columns) ' +
              'respect to the source image reference frame. This is not yet supported. ' +
              'Aborting segmentation loading. '
          );
        }

        const imageIdIndex = imageIdMaps.indices[imageId];
        const labelmapImage = labelMapImages[imageIdIndex];
        const labelmap2DView = labelmapImage.getPixelData();
        const imageVoxelManager = labelmapImage.voxelManager;

        const data = alignedPixelDataI.data;

        const indexCache = [];
        for (let k = 0, len = alignedPixelDataI.data.length; k < len; ++k) {
          if (data[k]) {
            for (let x = k; x < len; ++x) {
              if (data[x]) {
                if (!overlapping && labelmap2DView[x] !== 0) {
                  overlapping = true;
                  return resolve(
                    insertOverlappingPixelDataPlanar({
                      segmentsOnFrame,
                      labelMapImages,
                      pixelDataChunks,
                      multiframe,
                      referencedImageIds,
                      validOrientations,
                      metadataProvider,
                      tolerance,
                      segmentsPixelIndices,
                      sopUIDImageIdIndexMap,
                      imageIdMaps,
                    })
                  );
                }
                if (imageVoxelManager) {
                  // Ensure voxelManager updates boundaries
                  imageVoxelManager.setAtIndex(x, segmentIndex);
                } else {
                  // Directly assign pixel data when volume is not managed via voxelManager.
                  labelmap2DView[x] = segmentIndex;
                }
                indexCache.push(x);
              }
            }

            if (!segmentsOnFrame[imageIdIndex]) {
              segmentsOnFrame[imageIdIndex] = [];
            }

            segmentsOnFrame[imageIdIndex].push(segmentIndex);

            break;
          }
        }

        const segmentIndexObject = segmentsPixelIndices.get(segmentIndex);
        segmentIndexObject[imageIdIndex] = indexCache;
        segmentsPixelIndices.set(segmentIndex, segmentIndexObject);
      }

      const percentComplete = Math.round((firstIndex / groupsLen) * 100);
      throttledTriggerLoadProgressEvent(percentComplete);

      if (firstIndex < groupsLen) {
        setTimeout(() => processChunk(firstIndex + imagesPerChunk), 0);
      } else {
        // resolve the Promise when all images have been processed
        resolve({
          hasOverlappingSegments: false,
          arrayOfLabelMapImages: [labelMapImages],
        });
      }
    };
    const processLabelmapChunk = (firstIndex) => {
      // Cache properties and lengths outside loops for performance
      const pfSeq = multiframe.PerFrameFunctionalGroupsSequence;
      const sharedPlaneOrientation =
        multiframe.SharedFunctionalGroupsSequence.PlaneOrientationSequence
          ?.ImageOrientationPatient;

      for (
        let i = firstIndex;
        i < firstIndex + imagesPerChunk && i < groupsLen;
        i++
      ) {
        const PerFrameFunctionalGroups = pfSeq[i];
        const ImageOrientationPatientI =
          sharedPlaneOrientation ||
          PerFrameFunctionalGroups.PlaneOrientationSequence
            .ImageOrientationPatient;
        // Use slice to get the correct frame (TypedArray)
        const view = pixelDataChunks.subarray(
          i * sliceLength,
          (i + 1) * sliceLength
        );
        const pixelDataI2D = ndarray(view, [Rows, Columns]);
        const alignedPixelDataI = alignPixelDataWithSourceData(
          pixelDataI2D,
          ImageOrientationPatientI,
          validOrientations,
          tolerance
        );
        if (!alignedPixelDataI) {
          throw new Error(
            'Individual Labelmap SEG frames are out of plane with respect to the first SEG frame. ' +
              'This is not yet supported. Aborting segmentation loading.'
          );
        }
        const imageId = findReferenceSourceImageId(
          multiframe,
          i,
          referencedImageIds,
          metadataProvider,
          tolerance,
          sopUIDImageIdIndexMap
        );
        if (!imageId) {
          console.warn(
            `Image not present in stack, can't import frame : ${i}.`
          );
          continue;
        }
        const sourceImageMetadata = imageIdMaps.metadata[imageId];
        if (
          Rows !== sourceImageMetadata.Rows ||
          Columns !== sourceImageMetadata.Columns
        ) {
          throw new Error(
            'Individual Labelmap SEG frames have different geometry dimensions (Rows and Columns) ' +
              'respect to the source image reference frame. This is not yet supported. ' +
              'Aborting segmentation loading. '
          );
        }
        const imageIdIndex = imageIdMaps.indices[imageId];
        const labelmapImage = labelMapImages[imageIdIndex];
        const labelmap2DView = labelmapImage.getPixelData(); // TypedArray
        const data = alignedPixelDataI.data;
        let segmentsOnFrameArr = segmentsOnFrame[imageIdIndex];
        if (!segmentsOnFrameArr) {
          segmentsOnFrameArr = [];
          segmentsOnFrame[imageIdIndex] = segmentsOnFrameArr;
        }
        // Use a local Set to avoid .includes() in tight loop
        const segSet = new Set(segmentsOnFrameArr);
        for (let k = 0, len = data.length; k < len; ++k) {
          const segIdx = data[k];
          if (segIdx !== 0) {
            labelmap2DView[k] = segIdx;
            if (!segSet.has(segIdx)) {
              segmentsOnFrameArr.push(segIdx);
              segSet.add(segIdx);
            }
            if (!segmentsPixelIndices.has(segIdx)) {
              segmentsPixelIndices.set(segIdx, {});
            }
            const segmentPixelInfo = segmentsPixelIndices.get(segIdx);
            if (!segmentPixelInfo[imageIdIndex]) {
              segmentPixelInfo[imageIdIndex] = [];
            }
            segmentPixelInfo[imageIdIndex].push(k);
          }
        }
      }
      const percentComplete = Math.round((firstIndex / groupsLen) * 100);
      throttledTriggerLoadProgressEvent(percentComplete);
      if (firstIndex < groupsLen) {
        setTimeout(() => processLabelmapChunk(firstIndex + imagesPerChunk), 0);
      } else {
        resolve({
          hasOverlappingSegments: false,
          arrayOfLabelMapImages: [labelMapImages],
        });
      }
    };

    if (multiframe.SegmentationType === 'LABELMAP') {
      // If the segmentation is a labelmap, we can process it in chunks
      processLabelmapChunk(0);
    } else {
      processChunk(0);
    }
  });
}

const getAlignedPixelData = ({
  sharedImageOrientationPatient,
  PerFrameFunctionalGroups,
  pixelDataChunks,
  sequenceIndex,
  sliceLength,
  Rows,
  Columns,
  validOrientations,
  tolerance,
}) => {
  const ImageOrientationPatientI =
    sharedImageOrientationPatient ||
    PerFrameFunctionalGroups.PlaneOrientationSequence.ImageOrientationPatient;

  const view = readFromUnpackedChunks(
    pixelDataChunks,
    sequenceIndex * sliceLength,
    sliceLength
  );

  const pixelDataI2D = ndarray(view, [Rows, Columns]);

  const alignedPixelDataI = alignPixelDataWithSourceData(
    pixelDataI2D,
    ImageOrientationPatientI,
    validOrientations,
    tolerance
  );

  if (!alignedPixelDataI) {
    throw new Error(
      'Individual SEG frames are out of plane with respect to the first SEG frame. ' +
        'This is not yet supported. Aborting segmentation loading.'
    );
  }
  return alignedPixelDataI;
};

const checkImageDimensions = ({ metadataProvider, imageId, Rows, Columns }) => {
  const sourceImageMetadata = metadataProvider.get('instance', imageId);
  if (
    Rows !== sourceImageMetadata.Rows ||
    Columns !== sourceImageMetadata.Columns
  ) {
    throw new Error(
      'Individual SEG frames have different geometry dimensions (Rows and Columns) ' +
        'respect to the source image reference frame. This is not yet supported. ' +
        'Aborting segmentation loading. '
    );
  }
};

const getArrayOfLabelMapImagesWithSegmentData = ({
  arrayOfSegmentData,
  referencedImageIds,
}) => {
  let largestArray = [];
  let largestArrayIndex;

  for (let i = 0; i < arrayOfSegmentData.length; i++) {
    const segmentData = arrayOfSegmentData[i];
    if (segmentData.length > largestArray.length) {
      largestArray = segmentData;
      largestArrayIndex = i;
    }
  }

  return arrayOfSegmentData.map((arr) => {
    const labelMapImages = referencedImageIds
      .map((referencedImageId, i) => {
        const hasEmptySegmentData = !arr[i];

        // @TODO: right now cornerstone loses reference of the images when you don't have the complete set of images for each
        // grouping of segments, but in order to save memory we would ideally only duplicate images where the there is overlapping
        // so when this losing of reference is fixed, we can implement some filter like the one below in order to get rid of empty
        // segment images that only take up memory space
        // if (hasEmptySegmentData && i !== largestArrayIndex) {
        //     return;
        // }

        const labelMapImage =
          imageLoader.createAndCacheDerivedLabelmapImage(referencedImageId);

        const pixelData = labelMapImage.getPixelData();

        if (!hasEmptySegmentData) {
          for (let j = 0; j < pixelData.length; j++) {
            pixelData[j] = arr[i][j];
          }
        }

        return labelMapImage;
      })
      .filter(Boolean);
    return labelMapImages;
  });
};

export function insertOverlappingPixelDataPlanar({
  segmentsOnFrame,
  labelMapImages,
  pixelDataChunks,
  multiframe,
  referencedImageIds,
  validOrientations,
  metadataProvider,
  tolerance,
  segmentsPixelIndices,
  sopUIDImageIdIndexMap,
  imageIdMaps,
}) {
  const {
    SharedFunctionalGroupsSequence,
    PerFrameFunctionalGroupsSequence,
    Rows,
    Columns,
  } = multiframe;

  const sharedImageOrientationPatient =
    SharedFunctionalGroupsSequence.PlaneOrientationSequence
      ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
          .ImageOrientationPatient
      : undefined;
  const sliceLength = Columns * Rows;

  const arrayOfSegmentData = getArrayOfSegmentData({
    sliceLength,
    Rows,
    Columns,
    validOrientations,
    metadataProvider,
    imageIdMaps,
    segmentsOnFrame,
    tolerance,
    pixelDataChunks,
    PerFrameFunctionalGroupsSequence,
    labelMapImages,
    sopUIDImageIdIndexMap,
    multiframe,
    sharedImageOrientationPatient,
    segmentsPixelIndices,
  });

  const arrayOfLabelMapImagesWithSegmentData =
    getArrayOfLabelMapImagesWithSegmentData({
      arrayOfSegmentData,
      referencedImageIds,
    });

  return {
    arrayOfLabelMapImages: arrayOfLabelMapImagesWithSegmentData,
    hasOverlappingSegments: true,
  };
}

const getArrayOfSegmentData = ({
  sliceLength,
  Rows,
  Columns,
  validOrientations,
  metadataProvider,
  imageIdMaps,
  segmentsOnFrame,
  tolerance,
  pixelDataChunks,
  PerFrameFunctionalGroupsSequence,
  labelMapImages,
  sopUIDImageIdIndexMap,
  multiframe,
  sharedImageOrientationPatient,
  segmentsPixelIndices,
}) => {
  const arrayOfSegmentData = [];
  const numberOfSegments = multiframe.SegmentSequence.length;
  for (
    let currentSegmentIndex = 1;
    currentSegmentIndex <= numberOfSegments;
    ++currentSegmentIndex
  ) {
    const segmentData = getSegmentData({
      PerFrameFunctionalGroupsSequence,
      labelMapImages,
      sopUIDImageIdIndexMap,
      multiframe,
      segmentIndex: currentSegmentIndex,
      sliceLength,
      Rows,
      Columns,
      validOrientations,
      tolerance,
      pixelDataChunks,
      sharedImageOrientationPatient,
      metadataProvider,
      imageIdMaps,
      segmentsOnFrame,
      segmentsPixelIndices,
    });

    compactMergeSegmentDataWithoutInformationLoss({
      arrayOfSegmentData,
      newSegmentData: segmentData,
    });
  }

  return arrayOfSegmentData;
};

const getSegmentData = ({
  PerFrameFunctionalGroupsSequence,
  labelMapImages,
  sopUIDImageIdIndexMap,
  multiframe,
  segmentIndex,
  sliceLength,
  Rows,
  Columns,
  validOrientations,
  tolerance,
  pixelDataChunks,
  sharedImageOrientationPatient,
  metadataProvider,
  imageIdMaps,
  segmentsOnFrame,
  segmentsPixelIndices,
}) => {
  const segmentData = [];

  for (
    let currentLabelMapImageIndex = 0;
    currentLabelMapImageIndex < labelMapImages.length;
    currentLabelMapImageIndex++
  ) {
    const currentLabelMapImage = labelMapImages[currentLabelMapImageIndex];
    const referencedImageId = currentLabelMapImage.referencedImageId;

    const PerFrameFunctionalGroupsIndex =
      PerFrameFunctionalGroupsSequence.findIndex(
        (PerFrameFunctionalGroups, currentSequenceIndex) => {
          const {
            segmentIndex: groupsSegmentIndex,
            referencedImageId: groupsReferenceImageId,
          } = extractInfoFromPerFrameFunctionalGroups({
            PerFrameFunctionalGroups,
            sequenceIndex: currentSequenceIndex,
            sopUIDImageIdIndexMap,
            multiframe,
          });

          const isCorrectPerFrameFunctionalGroup =
            groupsSegmentIndex === segmentIndex &&
            groupsReferenceImageId === currentLabelMapImage.referencedImageId;

          return isCorrectPerFrameFunctionalGroup;
        }
      );

    if (PerFrameFunctionalGroupsIndex === -1) {
      continue;
    }

    const PerFrameFunctionalGroups =
      PerFrameFunctionalGroupsSequence[PerFrameFunctionalGroupsIndex];

    const alignedPixelDataI = getAlignedPixelData({
      sharedImageOrientationPatient,
      PerFrameFunctionalGroups,
      pixelDataChunks,
      sequenceIndex: PerFrameFunctionalGroupsIndex,
      sliceLength,
      Rows,
      Columns,
      validOrientations,
      tolerance,
    });

    checkImageDimensions({
      metadataProvider,
      Rows,
      Columns,
      imageId: referencedImageId,
    });

    const indexCache = [];
    const segmentationDataForImageId = alignedPixelDataI.data.map(
      (pixel, pixelIndex) => {
        const pixelValue = pixel ? segmentIndex : 0;
        if (pixelValue) {
          indexCache.push(pixelIndex);
        }
        return pixel ? segmentIndex : 0;
      }
    );

    const hasWrittenSegmentationData = indexCache.length > 0;

    if (hasWrittenSegmentationData) {
      segmentData[currentLabelMapImageIndex] = segmentationDataForImageId;
    }

    const imageIdIndex = imageIdMaps.indices[referencedImageId];

    updateSegmentsOnFrame({
      imageIdIndex,
      segmentIndex,
      segmentsOnFrame,
    });
    updateSegmentsPixelIndices({
      imageIdIndex,
      segmentIndex,
      segmentsPixelIndices,
      indexCache,
    });
  }
  return segmentData;
};

export { createLabelmapsFromBufferInternal };
